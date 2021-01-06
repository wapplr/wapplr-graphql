import {defaultDescriptor} from "./utils";
import {graphqlHTTP} from "express-graphql";
import {SchemaComposer} from "graphql-compose";
import {composeWithMongoose} from "graphql-compose-mongoose";

export default function initGraphql(p = {}) {

    const {wapp} = p;
    const {server} = wapp;

    const globalGraphqlConfig = (server.settings && server.settings.graphqlConfig) ? server.settings.graphqlConfig : {};
    const config = (p.config) ? {...globalGraphqlConfig, ...p.config} : {...globalGraphqlConfig};

    const {
        graphqlRoute = "/graphql",
    } = config;

    if (!server.graphql) {

        const defaultSchemaComposer = new SchemaComposer();

        function defaultBuildSchema() {
            server.graphql.schema = server.graphql.schemaComposer.buildSchema();
            return server.graphql.schema;
        }

        function defaultComposeFromModel(p = {}) {

            const {Model, schemaComposer = server.graphql.schemaComposer} = p;
            const modelName = p.modelName;
            const requestName = modelName.slice(0,1).toLowerCase() + modelName.slice(1);

            if (!server.graphql.fields[requestName]) {

                const TC = composeWithMongoose(Model, {schemaComposer});

                function recursiveCheck(tree, schema, parentKey = "") {

                    Object.keys(tree).forEach(function (key) {
                        const property = tree[key]
                        const type = property.type;
                        const nextKey = (parentKey) ? parentKey + "." + key : key;
                        if (typeof type === "object"){
                            recursiveCheck(property, TC, nextKey);
                        } else {
                            const options = property.wapplr || {};
                            const {hidden} = options;
                            if (hidden){
                                TC.removeField(nextKey)
                            }
                        }
                    })

                }

                recursiveCheck(Model.schema.tree, TC);

                TC.addFields({
                    id: {
                        type: "MongoID",
                        resolve: function (p = {}) {
                            return p.id
                        },
                        projection: {_id: true},
                    }
                });

                const resolvers = Model.resolvers || {};

                Object.keys(resolvers).forEach(function (key, i){

                    let resolverProperties = resolvers[key];
                    if (typeof resolverProperties == "function"){
                        resolverProperties = resolverProperties(TC);
                        resolvers[key] = resolverProperties;
                    }

                    const resolverWithDefaults = {
                        name: i.toString(),
                        type: TC,
                        args: {},
                        resolve: async function (p) {
                            return null;
                        },
                        ...resolverProperties,
                        kind: resolverProperties.kind || "query"
                    };

                    TC.addResolver(resolverWithDefaults);

                    if (resolverWithDefaults.kind === "query") {
                        schemaComposer.Query.addFields({[key]: TC.getResolver(resolverWithDefaults.name)});
                    }
                    if (resolverWithDefaults.kind === "mutation") {
                        schemaComposer.Mutation.addFields({[key]: TC.getResolver(resolverWithDefaults.name)});
                    }

                })

                server.graphql.fields[requestName] = TC;

            }

            return server.graphql.fields[requestName];

        }

        function defaultGenerateFromDatabase() {
            let changed = false;
            if (server.database){
                Object.keys(server.database).forEach(function (mongoConnectionString, i) {
                    const models = server.database[mongoConnectionString].models;
                    if (models){
                        Object.keys(models).forEach(function (modelName) {
                            const requestName = modelName.slice(0,1).toLowerCase() + modelName.slice(1);
                            if (!server.graphql.fields[requestName]){
                                changed = true;
                            }
                            const Model = models[modelName];
                            server.graphql.composeFromModel({
                                Model,
                                modelName,
                            })
                        })
                    }
                });
            }
            return changed;
        }

        function defaultMiddleware(req, res, next) {

            server.graphql.init();

            const path = req.path || req.url;

            if (path.slice(0,graphqlRoute.length) === graphqlRoute){

                const globals = wapp.globals;
                const {DEV} = globals;

                const schema = server.graphql.schema;

                if (!schema) {
                    return next();
                }

                graphqlHTTP({
                    schema: schema,
                    rootValue: {req, res, wapp},
                    context: {req, res, wapp},
                    graphiql: DEV,
                    pretty: !DEV,
                })(req, res, next)

                return

            }

            return next();
        }

        function defaultInit() {
            const changed = server.graphql.generateFromDatabase();
            if (changed) {
                server.graphql.buildSchema();
            }
        }

        const defaultGraphqlObject =  Object.create(Object.prototype, {
            fields: {
                ...defaultDescriptor,
                writable: false,
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
        })

        Object.defineProperty(server, "graphql", {
            ...defaultDescriptor,
            writable: false,
            value: defaultGraphqlObject
        });

        server.graphql.init();

    }

    return server.graphql;

}
