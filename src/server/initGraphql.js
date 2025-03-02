import {createHandler} from "graphql-http/lib/use/express";
import {SchemaComposer} from "graphql-compose";
import {composeWithMongoose, resolverFactory} from "graphql-compose-mongoose";

import renderGraphiQL from "./renderGraphiQl"

import {deCapitalize, defaultDescriptor} from "../common/utils";
import {createRequests} from "../common";
import tryCreateDefaultToClient from "./tryCreateDefaultToClient";

export default function initGraphql(p = {}) {

    const {wapp} = p;
    const {server} = wapp;

    const globalGraphqlConfig = (server.config && server.config.graphql) ? server.config.graphql : {};

    const {
        route = "/graphql",
    } = globalGraphqlConfig;

    if (!server.graphql) {

        const defaultSchemaComposer = new SchemaComposer();

        //util

        function getRecursiveCheck({Model}) {

            const disabledFields = [];
            const readOnlyFields = [];
            const readOnlyFieldFilters = {};
            const requiredFields = [];
            const removeRequiredFromInputArgs = [];
            const relations = [];
            const properties = {};

            const projection = {};

            function recursiveCheck(tree, parentKey = "", projection) {
                Object.keys(tree).forEach(function (key) {

                    const modelProperties = tree[key];

                    if (typeof modelProperties === "object" && typeof modelProperties.length === "undefined") {

                        const type = modelProperties.type;
                        const instance = modelProperties.instance;
                        const nextKey = (parentKey) ? parentKey + "." + key : key;

                        if (modelProperties.ref) {
                            relations.push({
                                nextKey,
                                modelProperties: {
                                    ...modelProperties,
                                    many: !!(typeof type === "object" && typeof type.length === "number" && type[0])
                                }
                            })
                        }

                        if (
                            (type?.tree && typeof instance === "undefined" && Object.keys(type.tree).length && !(key === "0")) ||
                            (typeof type === "undefined" && typeof instance === "undefined" && Object.keys(modelProperties).length && !(key === "0"))
                        ) {

                            const options = modelProperties.wapplr || {};
                            const {
                                addGraphqlComposeReadOnlyFieldsFilter
                            } = options;

                            if (addGraphqlComposeReadOnlyFieldsFilter) {
                                readOnlyFieldFilters[nextKey] = addGraphqlComposeReadOnlyFieldsFilter;
                            }

                            projection[nextKey] = {};

                            recursiveCheck((type?.tree) ? type.tree : modelProperties, nextKey, projection[nextKey]);
                        } else {

                            const options = modelProperties.wapplr || {};
                            const {
                                disabled,
                                readOnly,
                                addGraphqlComposeReadOnlyFieldsFilter
                            } = options;

                            let {required = (modelProperties.required === true)} = options;

                            if (options.writeCondition === "admin" && required) {
                                if (parentKey && removeRequiredFromInputArgs.indexOf(parentKey) === -1) {
                                    removeRequiredFromInputArgs.push(parentKey);
                                }
                                removeRequiredFromInputArgs.push(nextKey);
                                Model.schema.paths[key].isRequired = false;
                            }

                            if (disabled) {
                                disabledFields.push(nextKey);
                            }
                            if (readOnly) {
                                readOnlyFields.push(nextKey);
                            }
                            if (addGraphqlComposeReadOnlyFieldsFilter) {
                                readOnlyFieldFilters[nextKey] = addGraphqlComposeReadOnlyFieldsFilter;
                            }

                            properties[nextKey] = modelProperties;

                            projection[key] = {};

                            if (required) {
                                if (parentKey && requiredFields.indexOf(parentKey) === -1) {
                                    requiredFields.push(parentKey);
                                }
                                requiredFields.push(nextKey);
                            }

                        }

                    }

                })
            }

            recursiveCheck(Model.schema.tree, undefined, projection);

            return {
                disabledFields,
                readOnlyFields,
                readOnlyFieldFilters,
                requiredFields,
                removeRequiredFromInputArgs,
                relations,
                properties,
                projection
            }

        }

        //compose

        function defaultComposeFromModel(p = {}) {

            const {Model, schemaComposer = server.graphql.schemaComposer} = p;
            const modelName = Model.modelName;

            if (!server.graphql.TypeComposers[modelName]) {

                try {

                    const {
                        disabledFields,
                        readOnlyFields,
                        readOnlyFieldFilters,
                        requiredFields,
                        removeRequiredFromInputArgs,
                    } = getRecursiveCheck({Model});

                    if (!server.graphql.TypeComposers[modelName]) {

                        const virtuals = Model.schema.virtuals && Object.fromEntries(
                            Object.entries(Model.schema.virtuals).filter(([key]) => (
                                Model.schema.virtuals[key].path &&
                                Model.schema.virtuals[key].instance &&
                                Model.schema.virtuals[key].wapplr
                            )),
                        );

                        Object.keys(virtuals).forEach(function (key) {
                            Model.schema.paths[key] = virtuals[key];
                        });

                        const virtualKeys = Object.keys(virtuals);

                        const opts = {
                            schemaComposer,
                            removeFields: disabledFields,
                            inputType: {
                                requiredFields: requiredFields.filter(x => !removeRequiredFromInputArgs.includes(x))
                            },
                            resolvers: {
                                ...Object.fromEntries(Object.keys(resolverFactory).map(function (resolverName) {
                                    return [resolverName, {
                                        record: {
                                            removeFields: [...readOnlyFields, ...Object.keys(readOnlyFieldFilters).filter((key) => {
                                                return readOnlyFieldFilters[key]({resolverName})
                                            })],
                                            requiredFields: requiredFields.filter(x => !removeRequiredFromInputArgs.includes(x))
                                        },
                                        filter: {
                                            removeFields: (resolverName.match("One")) ? [...virtualKeys] : ["_id", ...virtualKeys]
                                        },
                                        findManyOpts: {
                                            filter: {
                                                removeFields: (resolverName.match("One")) ? [...virtualKeys] : ["_id", ...virtualKeys]
                                            },
                                            sort: {
                                                multi: true
                                            }
                                        }
                                    }]
                                })),
                            }
                        };

                        server.graphql.TypeComposers[modelName] = composeWithMongoose(Model, opts);

                        Object.keys(virtuals).forEach(function (key) {
                            delete Model.schema.paths[key];
                        });

                        Object.defineProperty(server.graphql.TypeComposers[modelName], "Model", {
                            enumerable: false,
                            writable: false,
                            configurable: false,
                            value: Model
                        });

                        requiredFields.forEach(function (fieldFullName) {
                            if (fieldFullName && fieldFullName.match(/\./g) && removeRequiredFromInputArgs.indexOf(fieldFullName) === -1) {
                                const types = fieldFullName.split(".");
                                try {
                                    const field = types[types.length - 1];
                                    const parentType = types.slice(0, -1).join(".");
                                    const parentTypeName = parentType.replace(/\../g, function (found) {
                                        return found.slice(-1).toUpperCase();
                                    });
                                    const ITCName = modelName.slice(0, 1).toUpperCase() + modelName.slice(1) + parentTypeName.slice(0, 1).toUpperCase() + parentTypeName.slice(1) + "Input";
                                    const ITC = schemaComposer.getITC(ITCName);
                                    ITC.makeRequired(field);

                                    const UpdateITC = schemaComposer.getITC("UpdateById" + ITCName);
                                    UpdateITC.makeRequired(field);

                                } catch (e) {
                                }
                            }
                        });

                        removeRequiredFromInputArgs.forEach(function (key) {
                            Model.schema.paths[key].isRequired = true;
                        })

                    }

                } catch (e) {
                    console.log(e)
                }

            }

            return server.graphql.TypeComposers[modelName];

        }

        function defaultGenerateFromDatabase() {
            if (server.database) {
                Object.keys(server.database).forEach(function (mongoConnectionString) {
                    const models = server.database[mongoConnectionString].models;
                    if (models) {
                        Object.keys(models).forEach(function (modelName) {
                            const Model = models[modelName];
                            server.graphql.composeFromModel({Model});
                        });
                    }
                });
            }

        }

        //projection

        function defaultProjectionForDataLoaderMany(p = {}) {

            const {Model} = p;
            const modelName = Model.modelName;

            if (server.graphql.TypeComposers[modelName] && !server.graphql.initializedProjectionsForDataLoaderMany) {

                try {

                    const {
                        projection,
                    } = getRecursiveCheck({Model});

                    server.graphql.TypeComposers[modelName].wrapResolverResolve('dataLoaderMany', next => async rp => {
                        rp.projection['*'] = true;
                        let response = [];
                        const deep = (rp.deep || 0) + 1;
                        try {
                            response = await next({...rp, deep});
                        } catch (e) {
                            console.log(e, 'dataLoaderMany2', modelName, deep, rp?.context?.req?.wappRequest)
                        }
                        return response;
                    });

                    server.graphql.TypeComposers[modelName].wrapResolverResolve('pagination', next => async rp => {
                        rp.projection.items = projection;
                        let response;
                        const deep = (rp.deep || 0) + 1;
                        try {
                            response = await next({...rp, deep});
                        } catch (e) {
                            console.log(e, 'pagination', modelName, deep, rp?.context?.req?.wappRequest)
                        }
                        return response;
                    });

                } catch (e) {
                    console.log(e)
                }

            }

            return server.graphql.TypeComposers[modelName];

        }

        function defaultInitProjectionForDataLoaderMany() {
            if (server.database) {
                Object.keys(server.database).forEach(function (mongoConnectionString) {
                    const models = server.database[mongoConnectionString].models;
                    if (models) {
                        Object.keys(models).forEach(function (modelName) {
                            const Model = models[modelName];
                            server.graphql.projectionForDataLoaderMany({Model});
                        });
                        server.graphql.initializedProjectionsForDataLoaderMany = true;
                    }
                });
            }

        }

        //resolvers

        function defaultInitResolvers() {

            const resolvers = server.graphql.resolvers;
            const schemaComposer = server.graphql.schemaComposer;

            Object.keys(resolvers).forEach(function (TCName, i) {

                const TC = server.graphql.TypeComposers[TCName];
                const resolversForTC = server.graphql.resolvers[TCName];

                if (TC && Object.keys(resolversForTC).length) {

                    Object.keys(resolversForTC).forEach(function (resolverName) {

                        let resolverProperties = resolversForTC[resolverName];

                        if (typeof resolverProperties == "function") {
                            resolverProperties = resolverProperties(TC, schemaComposer);
                            resolversForTC[resolverName] = resolverProperties;
                        }

                        if (!resolversForTC[resolverName].initialized) {

                            if (typeof resolverProperties["args"] == "function") {
                                resolverProperties["args"] = resolverProperties["args"](TC, schemaComposer)
                            }

                            const capitalizedResolverName = resolverName.slice(0, 1).toUpperCase() + resolverName.slice(1);
                            const TCLowerName = TCName.slice(0, 1).toLowerCase() + TCName.slice(1);
                            const requestName = TCLowerName + capitalizedResolverName;

                            resolverProperties.requestName = requestName;

                            const resolverWithDefaults = {
                                name: i.toString(),
                                type: TC,
                                args: {},
                                kind: "query",
                                resolve: async function emptyResolve() {
                                    return null;
                                },
                                ...resolverProperties,
                            };

                            TC.addResolver(resolverWithDefaults);

                            if (!resolverProperties.internal) {

                                if (resolverWithDefaults.kind === "query") {
                                    schemaComposer.Query.addFields({[requestName]: TC.getResolver(resolverWithDefaults.name)})
                                }
                                if (resolverWithDefaults.kind === "mutation") {
                                    schemaComposer.Mutation.addFields({[requestName]: TC.getResolver(resolverWithDefaults.name)})
                                }

                            }

                            Object.defineProperty(resolversForTC[resolverName], "initialized", {
                                ...defaultDescriptor,
                                enumerable: false,
                                writable: false,
                                value: true
                            });

                            if (resolverProperties.wapplr) {
                                Object.defineProperty(resolversForTC[resolverName], "wapplr", {
                                    ...defaultDescriptor,
                                    enumerable: false,
                                    value: resolverProperties.wapplr
                                })
                            }

                        }

                    })

                }

            })

        }

        function defaultRunGetResolvers() {

            const resolvers = server.graphql.resolvers;
            const schemaComposer = server.graphql.schemaComposer;

            Object.keys(resolvers).forEach(function (TCName) {

                const TC = server.graphql.TypeComposers[TCName];
                const resolversForTC = server.graphql.resolvers[TCName];

                if (TC && Object.keys(resolversForTC).length) {

                    Object.keys(resolversForTC).forEach(function (resolverName) {

                        let resolverProperties = resolversForTC[resolverName];

                        if (typeof resolverProperties == "function") {
                            resolverProperties = resolverProperties(TC, schemaComposer);
                            resolversForTC[resolverName] = resolverProperties;
                        }

                    })

                }

            })

        }

        //relations

        function defaultAddRelation(p = {}) {

            const {Model} = p;
            const modelName = Model.modelName;

            if (server.graphql.TypeComposers[modelName] && !server.graphql.initializedRelations) {

                try {

                    const {
                        disabledFields,
                        relations,
                    } = getRecursiveCheck({Model});

                    relations.forEach(function ({nextKey, modelProperties}) {
                        if (
                            (
                                (server.graphql.TypeComposers[modelProperties.ref] && modelProperties.ref !== modelName) ||
                                (server.graphql.TypeComposers[modelProperties.ref] && modelProperties.ref === modelName && modelProperties.wapplr?.refEnableSelfRelation)
                            ) && disabledFields.indexOf(nextKey) === -1
                        ) {

                            const prepareArgs =
                                (modelProperties.many) ?
                                    {
                                        _ids: (source) => {
                                            return (source[nextKey] && source[nextKey].length) ? source[nextKey].filter((post) => post && post._id) : []
                                        },
                                    } : {
                                        _id: (source) => {
                                            return (source[nextKey] && source[nextKey]._id) ? source[nextKey]._id : source[nextKey]
                                        },
                                    };

                            let resolver;

                            function getResolver() {

                                if (resolver) {
                                    return resolver;
                                }

                                resolver = (modelProperties.many) ?
                                    server.graphql.TypeComposers[modelProperties.ref].getResolver("dataLoaderMany").wrapResolve(next => async (rp) => {
                                        if (!rp.args._ids?.length) {
                                            return [];
                                        }
                                        let response = null;
                                        const deep = (rp.deep || 0) + 1;
                                        try {
                                            response = await next({
                                                ...rp,
                                                internal: true,
                                                deep
                                            });
                                        } catch (e) {
                                            console.log(e, 'dataLoaderMany', modelName, nextKey, modelProperties.ref, deep, nextKey, rp?.context?.req?.wappRequest);
                                        }
                                        const postType = (wapp.server.postTypes) ? await wapp.server.postTypes.getPostType({name: deCapitalize(modelProperties.ref)}) : null;
                                        if (!postType) {
                                            return (response && response.length) ? response.filter((post) => {
                                                return (post && post._id)
                                            }) : [];
                                        }

                                        if (modelProperties.required || modelProperties.wapplr?.required) {
                                            const userPostType =
                                                (rp.context.req.user && rp.context.req.session.modelName) ?
                                                    (rp.context.req.session.modelName === modelProperties.ref) ?
                                                        postType :
                                                        await wapp.server.postTypes.getPostType({name: deCapitalize(rp.context.req.session.modelName)}) :
                                                    null;

                                            const userStatusManager = (userPostType) ? userPostType.statusManager : null;
                                            const isAdmin = (userStatusManager) ? rp.context.req.user._status_isFeatured : false;

                                            if (isAdmin) {
                                                return (response && response.length) ? response.filter((post) => {
                                                    return (post && post._id)
                                                }) : [];
                                            }
                                        }

                                        return (response && response.length) ? response.filter((post) => {
                                            return (post && post._id &&
                                                post._status_isNotDeleted &&
                                                post._author_status_isNotDeleted)
                                        }) : [];
                                    })
                                    :
                                    server.graphql.TypeComposers[modelProperties.ref].getResolver("findById").wrapResolve(next => async (rp) => {
                                        if (!rp.args._id) {
                                            return null;
                                        }
                                        let post = null;
                                        const deep = (rp.deep || 0) + 1;
                                        try {
                                            post = await next({...rp, internal: true, deep});
                                        } catch (e) {
                                            console.log(e, 'findById', modelName, nextKey, modelProperties.ref, deep, nextKey, rp?.context?.req?.wappRequest);
                                        }
                                        const postType = (wapp.server.postTypes) ? await wapp.server.postTypes.getPostType({name: deCapitalize(modelProperties.ref)}) : null;
                                        if (!postType) {
                                            return (post && post._id) ? post : null;
                                        }

                                        if (modelProperties.required || modelProperties.wapplr?.required) {
                                            const userPostType =
                                                (rp.context.req.user && rp.context.req.session.modelName) ?
                                                    (rp.context.req.session.modelName === modelProperties.ref) ?
                                                        postType :
                                                        await wapp.server.postTypes.getPostType({name: deCapitalize(rp.context.req.session.modelName)}) :
                                                    null;

                                            const userStatusManager = (userPostType) ? userPostType.statusManager : null;
                                            const isAdmin = (userStatusManager) ? rp.context.req.user._status_isFeatured : false;

                                            if (isAdmin) {
                                                return (post && post._id) ? post : null;
                                            }
                                        }

                                        return (post && post._id) ? (post._status_isNotDeleted && post._author_status_isNotDeleted) ? post : null : post;
                                    });

                                return resolver;

                            }

                            const relProps = {
                                resolver: () => getResolver(),
                                prepareArgs: prepareArgs,
                                projection: {[nextKey]: (modelProperties.many) ? '*' : {}},
                            };

                            server.graphql.TypeComposers[modelName].addRelation(nextKey, relProps)
                        }
                    });


                } catch (e) {
                    console.log(e)
                }

            }

            return server.graphql.TypeComposers[modelName];

        }

        function defaultInitRelationsFromDatabase() {
            if (server.database) {
                Object.keys(server.database).forEach(function (mongoConnectionString) {
                    const models = server.database[mongoConnectionString].models;
                    if (models) {
                        Object.keys(models).forEach(function (modelName) {
                            const Model = models[modelName];
                            server.graphql.addRelation({Model});
                        });
                        server.graphql.initializedRelations = true;
                    }
                });
            }

        }

        //schema

        function defaultBuildSchema() {

            const newComposers = JSON.stringify(Object.keys(server.graphql.TypeComposers));

            const newResolvers = JSON.stringify(Object.keys(server.graphql.resolvers).map(function (TCName) {
                return JSON.stringify(Object.keys(server.graphql.resolvers[TCName]).map(function (resolverName) {
                    return (server.graphql.resolvers[TCName][resolverName].initialized) ? resolverName : "";
                }))
            }));

            if (newComposers + newResolvers !== server.graphql.initializedTypeCompsers) {
                server.graphql.schema = server.graphql.schemaComposer.buildSchema();
                server.graphql.initializedTypeCompsers = newComposers + newResolvers;
            }

            return server.graphql.schema;
        }

        //init

        function defaultInit() {

            const server = wapp.server;

            if (!server.graphql.initialized) {

                const schemaComposer = server.graphql.schemaComposer;

                server.graphql.generateFromDatabase();
                server.graphql.initProjectionForDataLoaderMany();
                server.graphql.initResolvers();
                server.graphql.initRelationsFromDatabase();
                server.graphql.runGetResolvers();

                if (!Object.keys(schemaComposer.Query.getFields()).length) {

                    const type = schemaComposer["createObjectTC"]({
                        name: "ISay",
                        fields: {
                            something: {
                                type: "String",
                            }
                        }
                    });

                    schemaComposer.Query.addFields({
                        Say: {
                            name: "SaySomething",
                            args: {that: {type: "String"}},
                            resolve: function (_, args) {
                                const text = (args.that) ? args.that : "Hi!";
                                return {something: "Isay: " + text}
                            },
                            kind: "query",
                            type: type
                        }
                    })

                }

                server.graphql.buildSchema();

                if (wapp.states) {
                    wapp.states.addHandle({
                        requestsFromGraphQl: function requestsFromGraphQl(req, res, next) {

                            const graphql = res.wappResponse.store.getState("res.graphql");

                            if (!graphql) {

                                let graphqlState = server.graphql.stateToClient;

                                if (!graphqlState) {

                                    graphqlState = {};

                                    if (server.graphql.resolvers) {

                                        Object.keys(server.graphql.resolvers).forEach(function (TCName) {

                                            Object.keys(server.graphql.resolvers[TCName]).forEach(function (resolverName) {

                                                const resolver = server.graphql.resolvers[TCName][resolverName];

                                                if (!resolver.internal) {

                                                    tryCreateDefaultToClient({
                                                        resolver,
                                                        DEV: wapp.globals.DEV,
                                                        GraphQLSchema: server.graphql.schema,
                                                        schemaComposer,
                                                        Model: server.graphql.TypeComposers[TCName].Model,
                                                        getModel: (TCName) => {
                                                            return server.graphql.TypeComposers[TCName]?.Model
                                                        }
                                                    });

                                                }

                                                if (resolver.toClient) {

                                                    const type = resolver.kind;
                                                    const requestName = resolver.requestName;

                                                    if (!graphqlState[type]) {
                                                        graphqlState[type] = {};
                                                    }

                                                    graphqlState[type][requestName] = resolver.toClient();

                                                }
                                            })

                                        })

                                    }

                                    server.graphql.stateToClient = graphqlState

                                }

                                res.wappResponse.store.dispatch(wapp.states.runAction("res", {
                                    name: "graphql",
                                    value: graphqlState
                                }));

                            }

                            createRequests({wapp, req, res});

                            next();

                        }
                    })
                }

                server.graphql.initialized = true;

            }

        }

        //middleware

        function defaultMiddleware(req, res, next) {

            server.graphql.init();
            const path = req.wappRequest.path || req.wappRequest.url;

            const globals = wapp.globals;
            const {DEV} = globals;

            const supportedMethod = (DEV && req.wappRequest.method === 'GET') || (req.wappRequest.method === 'POST');

            if (path.slice(0, route.length) === route && supportedMethod) {

                const schema = server.graphql.schema;

                if (!schema) {
                    return next();
                }

                let firstRequestName = "";
                try {
                    const query = req.body.query || "";
                    if (typeof query == "string") {
                        const isMutation = query.match("mutation");
                        firstRequestName = query.split("{")[1].split(" ")[(isMutation) ? 0 : 1];
                        if (firstRequestName.slice(0, 1) === "(") {
                            firstRequestName = firstRequestName.slice(1);
                        }
                        if (firstRequestName.slice(-1) === ":") {
                            firstRequestName = firstRequestName.slice(0, -1);
                        }
                    }
                } catch (e) {
                }

                wapp.server.middlewares.log(
                    firstRequestName ? {
                        ...req,
                        wappRequest: {...req.wappRequest, url: req.wappRequest.url + "/" + firstRequestName}
                    } : req,
                    res,
                    function () {

                        if (DEV && req.wappRequest.method === 'GET') {
                            res.send(renderGraphiQL({options: {url: route}}));
                            return;
                        }

                        if (req.wappRequest.method === 'POST') {
                            // noinspection JSUnusedGlobalSymbols
                            const handler = createHandler({
                                schema: schema,
                                context: () => ({req, res, wapp}),
                                ...req.body?.variables?.upload ? {
                                    parseRequestParams: async () => {
                                        return {
                                            ...req.body,
                                        }
                                    }
                                } : {}
                            });
                            handler(req, res, next);
                            return;
                        }

                        next()

                    }
                );

                return;

            }

            return next();
        }

        //external

        function defaultAddResolver(p = {}) {
            const {TCName, resolverName, resolver} = p;
            if (resolverName && TCName && resolver) {
                if (!server.graphql.resolvers[TCName]) {
                    server.graphql.resolvers[TCName] = {};
                }
                server.graphql.resolvers[TCName][resolverName] = resolver;
            }
        }

        function defaultAddResolversToTC(p = {}) {
            const {TCName, resolvers} = p;
            if (resolvers && TCName) {
                if (!server.graphql.resolvers[TCName]) {
                    server.graphql.resolvers[TCName] = {};
                }
                Object.keys(resolvers).forEach(function (resolverName) {
                    if (resolvers[resolverName]) {
                        server.graphql.resolvers[TCName][resolverName] = resolvers[resolverName];
                    }
                });
                return server.graphql.resolvers[TCName];
            }
            return null;
        }


        const defaultGraphqlObject = Object.create(Object.prototype, {
            TypeComposers: {
                ...defaultDescriptor,
                writable: false,
                enumerable: false,
                value: {}
            },
            schema: {
                ...defaultDescriptor,
                value: null
            },
            schemaComposer: {
                ...defaultDescriptor,
                value: defaultSchemaComposer
            },

            composeFromModel: {
                ...defaultDescriptor,
                value: defaultComposeFromModel
            },
            generateFromDatabase: {
                ...defaultDescriptor,
                value: defaultGenerateFromDatabase
            },

            projectionForDataLoaderMany: {
                ...defaultDescriptor,
                value: defaultProjectionForDataLoaderMany
            },
            initProjectionForDataLoaderMany: {
                ...defaultDescriptor,
                value: defaultInitProjectionForDataLoaderMany
            },

            initResolvers: {
                ...defaultDescriptor,
                value: defaultInitResolvers
            },
            runGetResolvers: {
                ...defaultDescriptor,
                value: defaultRunGetResolvers
            },

            addRelation: {
                ...defaultDescriptor,
                value: defaultAddRelation
            },
            initRelationsFromDatabase: {
                ...defaultDescriptor,
                value: defaultInitRelationsFromDatabase
            },

            buildSchema: {
                ...defaultDescriptor,
                value: defaultBuildSchema
            },

            middleware: {
                ...defaultDescriptor,
                value: defaultMiddleware
            },
            init: {
                ...defaultDescriptor,
                value: defaultInit
            },

            resolvers: {
                ...defaultDescriptor,
                value: {}
            },
            addResolver: {
                ...defaultDescriptor,
                value: defaultAddResolver
            },
            addResolversToTC: {
                ...defaultDescriptor,
                value: defaultAddResolversToTC
            },

        });

        Object.defineProperty(server, "graphql", {
            ...defaultDescriptor,
            writable: false,
            value: defaultGraphqlObject
        });

        Object.defineProperty(server.graphql, "wapp", {
            ...defaultDescriptor,
            writable: false,
            enumerable: false,
            value: wapp
        });

    }

    return server.graphql;

}
