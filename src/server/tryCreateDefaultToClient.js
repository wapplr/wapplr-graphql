import * as gqlQueryBuilder from "gql-query-builder";
import {MutationAdapter, QueryAdapter} from "./adapters";

import { parseType } from "graphql/language/parser";

function recursiveFieldsToBuilder(object, saveFields) {
    Object.keys(object).forEach(function (resPropKey){
        if (resPropKey === "fields"){

            const fieldsData = {};
            if (object.union){
                fieldsData.operation = resPropKey;
                fieldsData.variables = {};
                fieldsData.fields = [];
                fieldsData.union = true;
            } else {
                fieldsData[resPropKey] = [];
            }

            recursiveFieldsToBuilder(object[resPropKey], (object.union) ? fieldsData.fields : fieldsData[resPropKey]);
            saveFields.push(fieldsData)
        } else {
            if (object[resPropKey] && object[resPropKey].fields){

                const fieldsData = {};
                if (object[resPropKey].union){
                    fieldsData.operation = resPropKey;
                    fieldsData.variables = {};
                    fieldsData.fields = [];
                    fieldsData.union = true;
                } else {
                    fieldsData[resPropKey] = [];
                }

                recursiveFieldsToBuilder(object[resPropKey].fields, (object[resPropKey].union) ? fieldsData.fields : fieldsData[resPropKey]);
                saveFields.push(fieldsData)
            } else {
                saveFields.push(resPropKey)
            }
        }
    })
}

function recursiveArgsToBuilder(object, saveFields, deep = 0) {
    Object.keys(object).forEach(function (resPropKey){
        if (resPropKey === "fields"){
            recursiveArgsToBuilder(object[resPropKey], saveFields, deep+1)
        } else {

            saveFields[resPropKey] = {};

            if (object[resPropKey].typeName) {
                saveFields[resPropKey].type = object[resPropKey].typeName;
            } else if (object[resPropKey].name && object[resPropKey].parseValue) {
                saveFields[resPropKey].type = object[resPropKey].name;
            } else {
                if (object[resPropKey].toString && object[resPropKey].toString() === "Int"){
                    saveFields[resPropKey].type = object[resPropKey].toString();
                }
            }

            if (object[resPropKey].required){
                saveFields[resPropKey].required = true;
            }
            if (object[resPropKey].list){
                saveFields[resPropKey].list = true;
            }
            if (object[resPropKey].listIsRequired){
                saveFields[resPropKey].list = [true];
            }

            if (object[resPropKey] && object[resPropKey].fields){
                recursiveArgsToBuilder(object[resPropKey].fields, saveFields[resPropKey], deep + 1)
            } else if (typeof object[resPropKey] == "string"){
                saveFields[resPropKey] = object[resPropKey]
            }
        }
    })
}

function typeToString(type) {
    let r = type;
    if (type?.toJSON){
        r = type.toJSON();
    }
    if (type?.toString){
        r = type.toString();
    }
    return r;
}

function recursiveArgsToFormData(resolverProperties = {}, jsonSchema = {}, object, saveFields, parentKey = "") {

    Object.keys(object).forEach(function (resPropKey){

        if (resPropKey === "fields"){
            recursiveArgsToFormData(resolverProperties, jsonSchema[resPropKey], object[resPropKey], saveFields, resPropKey);
        } else {

            const nextKey = (parentKey) ? parentKey + "." + resPropKey : resPropKey;

            const schemaObject = jsonSchema[resPropKey] || {};
            const resolverPropertiesObject = resolverProperties[resPropKey] || {};

            if (object[resPropKey] && object[resPropKey].fields && !schemaObject.enum){
                const nextSchema = (resPropKey === "record") ? jsonSchema : schemaObject.properties;
                recursiveArgsToFormData(resolverPropertiesObject, nextSchema, object[resPropKey].fields, saveFields, nextKey)
            } else {

                saveFields[nextKey] = {
                    ...(schemaObject.wapplr?.formData) ? {...schemaObject.wapplr.formData} : {},
                    ...(resolverPropertiesObject.wapplr?.formData) ? {...resolverPropertiesObject.wapplr.formData} : {},
                };

                const writeCondition =  schemaObject.wapplr?.writeCondition;

                if (typeof saveFields[nextKey].writeCondition == "undefined" && writeCondition){
                    saveFields[nextKey].writeCondition = writeCondition;
                }

                const ref = schemaObject.ref || schemaObject.wapplr?.ref || schemaObject["x-ref"];

                if (ref && typeof saveFields[nextKey].refPostType == "undefined"){
                    saveFields[nextKey].refPostType = ref.toLowerCase();
                }

                const disableFindByAuthor =  schemaObject.wapplr?.disableFindByAuthor;

                if (disableFindByAuthor && saveFields[nextKey].refPostType && typeof saveFields[nextKey].disableFindByAuthor == "undefined"){
                    saveFields[nextKey].disableFindByAuthor = disableFindByAuthor;
                }

                if (typeof object[resPropKey] == "object" && object[resPropKey].typeName) {

                    if (typeof saveFields[nextKey].schemaType == "undefined") {
                        saveFields[nextKey].schemaType = typeToString(object[resPropKey].typeName.name ? object[resPropKey].typeName.name : object[resPropKey].typeName);
                    }

                    if (object[resPropKey].options && typeof object[resPropKey].options == "object"){
                        if (!saveFields[nextKey].options){
                            saveFields[nextKey].options = [];
                        }
                        Object.keys(object[resPropKey].options).forEach((key)=>{
                            const found = saveFields[nextKey].options.find((a)=>a.value === object[resPropKey].options[key].value);
                            if (found){
                                if (typeof found.label == "undefined"){
                                    found.label = key;
                                }
                            } else {
                                saveFields[nextKey].options.push({
                                    label: key,
                                    value: object[resPropKey].options[key].value
                                })
                            }
                        })
                    }

                    if (object[resPropKey].required && !object[resPropKey].list){

                        if (typeof saveFields[nextKey].required == "undefined") {
                            saveFields[nextKey].required = true;
                        }

                        if (saveFields[nextKey].required) {
                            if (typeof saveFields[nextKey].default == "undefined") {

                                if (saveFields[nextKey].schemaType === "String") {
                                    saveFields[nextKey].default = "";
                                }
                                if (saveFields[nextKey].schemaType === "MongoID") {
                                    saveFields[nextKey].default = "";
                                }
                                if (saveFields[nextKey].schemaType === "Boolean") {
                                    saveFields[nextKey].default = false;
                                }
                                if (saveFields[nextKey].schemaType === "Number") {
                                    saveFields[nextKey].default = 0;
                                }
                                if (saveFields[nextKey].schemaType === "Float") {
                                    saveFields[nextKey].default = 0;
                                }

                                if (saveFields[nextKey].options && typeof schemaObject.default !== "undefined"){
                                    saveFields[nextKey].default = schemaObject.default;
                                }

                            }
                        }

                    }

                    if (object[resPropKey].list && typeof saveFields[nextKey].multiple == "undefined"){
                        saveFields[nextKey].multiple = true;
                    }

                    if (object[resPropKey].list && object[resPropKey].listIsRequired) {
                        if (typeof saveFields[nextKey].required == "undefined") {
                            saveFields[nextKey].required = true;
                        }
                        if (saveFields[nextKey].required && typeof saveFields[nextKey].default == "undefined") {
                            saveFields[nextKey].default = [];

                            if (saveFields[nextKey].options && typeof schemaObject.default !== "undefined"){
                                saveFields[nextKey].default = schemaObject.default;
                            }

                        }
                    }

                    if (saveFields[nextKey].multiple && saveFields[nextKey].required && typeof saveFields[nextKey].requiredAsteriskDisableShowOnLabel == "undefined"){
                        saveFields[nextKey].requiredAsteriskDisableShowOnLabel = true;
                    }

                    if (saveFields[nextKey].multiple && schemaObject.wapplr?.sortable && typeof saveFields[nextKey].sortable == "undefined"){
                        saveFields[nextKey].sortable = schemaObject.wapplr?.sortable;
                    }

                } else {
                    saveFields[nextKey].schemaType = typeToString(object[resPropKey]);
                }
            }
        }
    })

}

function saveListAndTableProps({schemaObject, resolverPropertiesObject, listData, nextKey, object, resPropKey}) {
    const list = {
        ...(schemaObject?.wapplr?.listData?.list) ? schemaObject.wapplr.listData.list : {},
        ...(resolverPropertiesObject.wapplr?.listData?.list) ? resolverPropertiesObject.wapplr.listData.list : {}
    };
    if (Object.keys(list).length){
        listData.list[nextKey] = list;
    }

    const table = {
        ...(schemaObject?.wapplr?.listData?.table) ? schemaObject.wapplr.listData.table : {},
        ...(resolverPropertiesObject.wapplr?.listData?.table) ? resolverPropertiesObject.wapplr.listData.table : {}
    };
    if (Object.keys(table).length){
        listData.table[nextKey] = table;
        listData.table[nextKey].schemaType =
            listData.table[nextKey].schemaType ||
            (typeof object[resPropKey] == "object" && object[resPropKey].typeName) ?
                typeToString(object[resPropKey].typeName.name ? object[resPropKey].typeName.name : object[resPropKey].typeName) :
                typeToString(object[resPropKey]);

        if (listData.table[nextKey].required) {

            if (typeof schemaObject?.wapplr.default !== "undefined" && typeof listData.table[nextKey].default == "undefined"){

                listData.table[nextKey].default = schemaObject.wapplr.default;

            } else if (typeof listData.table[nextKey].default == "undefined") {
                if (listData.table[nextKey].schemaType === "String") {
                    listData.table[nextKey].default = "";
                }
                if (listData.table[nextKey].schemaType === "MongoID") {
                    listData.table[nextKey].default = "";
                }
                if (listData.table[nextKey].schemaType === "Boolean") {
                    listData.table[nextKey].default = false;
                }
                if (listData.table[nextKey].schemaType === "Number") {
                    listData.table[nextKey].default = 0;
                }
                if (listData.table[nextKey].schemaType === "Float") {
                    listData.table[nextKey].default = 0;
                }
            }

        }

    }
}

function recursiveFieldsToListData(resolverProperties = {}, jsonSchema = {}, object, listData, parentKey = "") {

    Object.keys(object).forEach(function (resPropKey){

        if (resPropKey === "fields"){
            recursiveFieldsToListData(resolverProperties, jsonSchema[resPropKey], object[resPropKey], listData, resPropKey);
        } else {

            const nextKey = (parentKey) ? parentKey + "." + resPropKey : resPropKey;
            const schemaObject = jsonSchema[resPropKey] || {};
            const resolverPropertiesObject = resolverProperties[resPropKey] || {};

            if (object[resPropKey] && object[resPropKey].fields){

                saveListAndTableProps({schemaObject, resolverPropertiesObject, listData, nextKey, object, resPropKey});

                const nextSchema = (resPropKey === "record") ? jsonSchema : schemaObject.properties;
                recursiveFieldsToListData(resolverPropertiesObject, nextSchema, object[resPropKey].fields, listData, nextKey);

            } else {

                saveListAndTableProps({schemaObject, resolverPropertiesObject, listData, nextKey, object, resPropKey});

                if (listData.sort) {

                    const filteredSortFields = listData.sort.filter(({propertyNameArray}) => propertyNameArray.indexOf(nextKey) > -1);

                    if (filteredSortFields.length) {
                        filteredSortFields.forEach((sortFieldData) => {
                            if (!sortFieldData.listData) {
                                sortFieldData.listData = {};
                            }
                            sortFieldData.listData[nextKey] = {
                                ...(schemaObject?.wapplr?.listData?.sort) ? schemaObject.wapplr.listData.sort : {},
                                ...(resolverPropertiesObject.wapplr?.listData?.sort) ? resolverPropertiesObject.wapplr.listData.sort : {}
                            };

                            const {
                                ascLabel = "Ascending by " + nextKey,
                                descLabel = "Descending by " + nextKey,
                            } = sortFieldData.listData[nextKey];

                            const defaultT = sortFieldData.listData[nextKey].default || "ASC";

                            sortFieldData.listData[nextKey].default =
                                (sortFieldData.value?.value[nextKey] === -1 && defaultT === "DESC") ||
                                (sortFieldData.value?.value[nextKey] === 1 && defaultT === "ASC");

                            sortFieldData.listData[nextKey].label = (sortFieldData.value?.value[nextKey] === -1) ? descLabel : ascLabel;

                            delete sortFieldData.listData[nextKey].descLabel;
                            delete sortFieldData.listData[nextKey].ascLabel;
                        });
                    }

                }

            }
        }
    })

}


function tryBuildAQueryFromClientData(p = {}) {

    const {dataToClient = {}} = p;
    const kind = dataToClient._kind;
    const requestName = dataToClient._requestName;

    let buildedQuery;

    try {
        if (gqlQueryBuilder && gqlQueryBuilder[kind]){

            const config = {
                operation: requestName,
                fields: dataToClient._fieldsToBuilder,
            };

            if (kind === "query"){
                config.adapter = QueryAdapter;
            }

            if (kind === "mutation"){
                config.adapter = MutationAdapter;
            }

            if (dataToClient._argsToBuilder){
                config.variables = dataToClient._argsToBuilder;
            }

            buildedQuery = gqlQueryBuilder[kind](config, config.adapter);

            if (buildedQuery.query){
                buildedQuery.query = buildedQuery.query.replace(/\n/g, " ").replace(/\s\s+/g, " ")
            }

        }
    } catch (e){
        //console.log(e)
    }

    return buildedQuery;
}

export default function tryCreateDefaultToClient(p = {}) {

    const {resolver, DEV, GraphQLSchema, schemaComposer, Model} = p;

    if (resolver && !resolver.toClient){

        try {

            const resolverProperties = resolver.wapplr;
            const {maxDepth = 2} = resolverProperties || {};

            function recursiveDataToClient(GraphQLSchema, schemaComposer, object, saveFields, required, isList, depth = 0) {

                Object.keys(object).forEach(function (resPropKey){

                    if (resPropKey === "ofType" || resPropKey === "type"){

                        if (isList){
                            saveFields.list = true;
                            if (isList > 1){
                                saveFields.listIsRequired = true;
                            }
                        }

                        if (required) {
                            saveFields.required = required;
                        }

                        if (object[resPropKey].ofType){

                            let listType = 0;
                            let nonNullComposer = false;
                            if (object[resPropKey].toJSON) {
                                const string = object[resPropKey].toJSON();
                                const parsedString = schemaComposer.typeMapper.typeFromAST(parseType(string));
                                if (parsedString.constructor.name === "ListComposer"){
                                    listType = (required) ? 2 : 1;
                                }
                                if (parsedString.constructor.name === "NonNullComposer"){
                                    nonNullComposer = true;
                                }
                            } else {
                                if (object[resPropKey].constructor?.name === "ListComposer"){
                                    listType = (required) ? 2 : 1;
                                }
                                if (object[resPropKey].constructor?.name === "NonNullComposer"){
                                    nonNullComposer = true;
                                }
                            }

                            if (depth >= maxDepth ){
                                return;
                            }

                            recursiveDataToClient(GraphQLSchema, schemaComposer, object[resPropKey], saveFields, nonNullComposer, listType, depth);

                        } else {

                            saveFields.fields = {};
                            saveFields.typeName =
                                saveFields.typeName ||
                                (object[resPropKey] && object[resPropKey]._gqType) ||
                                (object[resPropKey] && object[resPropKey].getType && object[resPropKey].getType()._gqType) ||
                                (object[resPropKey] && object[resPropKey].getName && object[resPropKey].getName()) ||
                                (object[resPropKey] && object[resPropKey].getType && object[resPropKey].getType().name) ||
                                object[resPropKey].typeName ||
                                object[resPropKey].name;

                            if ((object[resPropKey].constructor.name === "GraphQLEnumType") ||
                                object[resPropKey].constructor.name === "EnumTypeComposer") {
                                saveFields.enum = true;
                            }

                            let fields = null;

                            if (object[resPropKey].toConfig) {
                                const config = object[resPropKey].toConfig();
                                fields = {...(config.fields) ? config.fields : {}}
                            }

                            if (object[resPropKey].getFields) {
                                fields = {...object[resPropKey].getFields()}
                            }

                            const possibleTypes = GraphQLSchema.getPossibleTypes(object[resPropKey]);
                            if (possibleTypes && possibleTypes.length){
                                possibleTypes.forEach(function (possibleType) {
                                    fields[possibleType.name] = {
                                        type: possibleType,
                                        union: true,
                                        args: []
                                    };
                                })
                            }

                            if (saveFields.enum && fields && Object.keys(fields).length){
                                try {
                                    if (typeof fields[Object.keys(fields)[0]].value === "string"){
                                        saveFields.typeName = "String";
                                    }
                                    if (typeof fields[Object.keys(fields)[0]].value === "number"){
                                        saveFields.typeName = "Float";
                                    }
                                    saveFields.options = fields;
                                } catch (e){
                                    console.log(e);
                                }
                            }

                            if (fields && Object.keys(fields).length && !saveFields.enum){

                                const enableIndex = Object.keys(fields).indexOf("_id") > -1 ? Object.keys(fields).indexOf("_id") : 0;
                                Object.keys(fields).forEach(function (fieldName, i) {

                                    if (depth < maxDepth || i === enableIndex ){

                                        let typeString =
                                            (fields[fieldName] && fields[fieldName].type && fields[fieldName].type._gqType) ?
                                                fields[fieldName].type._gqType :
                                                (fields[fieldName] && fields[fieldName].type && fields[fieldName].type.getTypeName) ?
                                                    fields[fieldName].type.getTypeName() :
                                                    fields[fieldName].type;

                                        let isObject = !!(
                                            (fields[fieldName] &&
                                                fields[fieldName].type &&
                                                fields[fieldName].type.getFields)
                                        );

                                        let listType = !!(
                                            (fields[fieldName].constructor?.name === "ListComposer" && fieldName !== "OR" && fieldName !== "AND") ||
                                            (fields[fieldName].constructor?.name === "GraphQLList" && fieldName !== "OR" && fieldName !== "AND") ||
                                            (fields[fieldName].type?.constructor?.name === "ListComposer" && fieldName !== "OR" && fieldName !== "AND") ||
                                            (fields[fieldName].type?.constructor?.name === "GraphQLList" && fieldName !== "OR" && fieldName !== "AND")
                                        );

                                        let nonNullComposer = !!(
                                            (fields[fieldName].constructor?.name === "NonNullComposer" && fieldName !== "OR" && fieldName !== "AND") ||
                                            (fields[fieldName].constructor?.name === "GraphQLNonNull" && fieldName !== "OR" && fieldName !== "AND") ||
                                            (fields[fieldName].type?.constructor?.name === "NonNullComposer" && fieldName !== "OR" && fieldName !== "AND") ||
                                            (fields[fieldName].type?.constructor?.name === "GraphQLNonNull" && fieldName !== "OR" && fieldName !== "AND")
                                        );

                                        try {
                                            const string = fields[fieldName].toJSON ? fields[fieldName].toJSON() : fields[fieldName].toString();
                                            const parsedString = (typeof string === "string") ? schemaComposer.typeMapper.typeFromAST(parseType(string)) : fields[fieldName];
                                            if (parsedString.constructor.name === "ListComposer"){
                                                listType = true;
                                            }
                                            if (parsedString.constructor.name === "NonNullComposer"){
                                                nonNullComposer = true;
                                            }
                                            if (parsedString.constructor.name === "ObjectTypeComposer"){
                                                isObject = true;
                                            }

                                        } catch (e){}



                                        if (nonNullComposer){
                                            listType = false;
                                        }

                                        if (nonNullComposer || listType){
                                            isObject = false;
                                        }

                                        saveFields.fields[fieldName] = (isObject || listType || nonNullComposer) ? {} : (typeString) ? typeString : fields[fieldName];

                                        if (fields[fieldName].union) {
                                            saveFields.fields[fieldName].union = true;
                                        }

                                        const isRel = typeof fields[fieldName].resolve === "function";

                                        if (isObject) {
                                            recursiveDataToClient(GraphQLSchema, schemaComposer, fields[fieldName], saveFields.fields[fieldName], false, 0, (isRel) ? depth+1 : depth)
                                        } else if (listType) {
                                            recursiveDataToClient(GraphQLSchema, schemaComposer, fields[fieldName], saveFields.fields[fieldName], false, 1, (isRel) ? depth+1 : depth)
                                        } else if (nonNullComposer) {
                                            recursiveDataToClient(GraphQLSchema, schemaComposer, fields[fieldName], saveFields.fields[fieldName], true, 0, (isRel) ? depth+1 : depth)
                                        }

                                    }

                                })

                            } else {
                                delete saveFields.fields;
                            }

                        }

                    }

                })
            }

            const dataToClient = {
                _kind: resolver.kind,
                _requestName: resolver.requestName || resolver.name
            };

            recursiveDataToClient(GraphQLSchema, schemaComposer, resolver, dataToClient);

            delete dataToClient.typeName;

            if (dataToClient.fields){
                dataToClient._fields = dataToClient.fields;
                delete dataToClient.fields;
                dataToClient._fieldsToBuilder = [];
                recursiveFieldsToBuilder(dataToClient._fields, dataToClient._fieldsToBuilder);
            }

            if (resolver.args && Object.keys(resolver.args).length) {

                const args = {};

                recursiveDataToClient(
                    GraphQLSchema,
                    schemaComposer,
                    {
                        type:{
                            getFields: function () {
                                return Object.keys(resolver.args).reduce(function (a, key){
                                    let add = resolver.args[key];
                                    if (typeof add == "string"){
                                        try {
                                            add = schemaComposer.typeMapper.typeFromAST(parseType(add));
                                        } catch (e){}
                                    }
                                    a[key] = add;
                                    return a;
                                }, {})
                            }
                        }
                    },
                    args
                );

                dataToClient._args = args.fields;

                dataToClient._argsToBuilder = {};
                recursiveArgsToBuilder(dataToClient._args, dataToClient._argsToBuilder);

                dataToClient.formData = {};
                const jsonSchema = Model.getJsonSchema({doNotDeleteDisabledFields: true});
                recursiveArgsToFormData(resolverProperties, jsonSchema.properties, dataToClient._args, dataToClient.formData);

                const resolverNameWithoutModelPrefix = resolver.name || dataToClient._requestName.split(Model.modelName)[1] || "send";
                const submitLabel = resolverNameWithoutModelPrefix.slice(0,1).toUpperCase() + resolverNameWithoutModelPrefix.slice(1);
                dataToClient.formData.submit = {
                    label: submitLabel
                };

                if (resolverNameWithoutModelPrefix.match("Many")) {

                    dataToClient.listData = {
                        list: {},
                        table: {}
                    };

                    if (typeof dataToClient._args.sort?.options === "object") {

                        dataToClient.listData.sort = Object.keys(dataToClient._args.sort.options).map((key) => {
                            return {
                                key: key,
                                value: dataToClient._args.sort.options[key],
                                propertyNameArray: Object.keys(dataToClient._args.sort.options[key].value)
                            }
                        });

                    }

                    if (typeof dataToClient._args.perPage === "object") {

                        const resolverPropertiesObject = resolverProperties["perPage"] || {};
                        const schemaObject =  jsonSchema.properties["perPage"] || {};

                        dataToClient.listData.perPage = {
                            limit: 100,
                            default: 20,
                            ...(schemaObject?.wapplr?.listData?.perPage) ? schemaObject.wapplr.listData.perPage : {},
                            ...(resolverPropertiesObject.wapplr?.listData?.perPage) ? resolverPropertiesObject.wapplr.listData.perPage : {}
                        };

                    }

                    recursiveFieldsToListData(resolverProperties, jsonSchema.properties, dataToClient._fields.items.fields, dataToClient.listData);

                    if (typeof dataToClient._args.sort?.options === "object") {

                        dataToClient.listData.sort = dataToClient.listData.sort.filter((sortFieldData) => {
                            return !sortFieldData.listData || (sortFieldData.listData && !Object.keys(sortFieldData.listData).find((key) => sortFieldData.listData[key].disabled))
                        });
                        dataToClient.listData.sort = dataToClient.listData.sort.sort((a, b) => {

                            const aOrder = Object.keys(a.listData).reduce((n, key) => {
                                const order = (typeof a.listData[key].order === "number") ? a.listData[key].order : dataToClient.listData.length - 1;
                                return n + order;
                            }, 0);

                            const bOrder = Object.keys(b.listData).reduce((n, key) => {
                                const order = (typeof b.listData[key].order === "number") ? b.listData[key].order : dataToClient.listData.length - 1;
                                return n + order;
                            }, 0);

                            if (aOrder === bOrder && a.propertyNameArray.join(",") === b.propertyNameArray.join(",")) {

                                const aDefault = Object.keys(a.listData).reduce((n, key) => {
                                    const order = (a.listData[key].default) ? 1 : 0;
                                    return n + order;
                                }, 0);

                                const bDefault = Object.keys(b.listData).reduce((n, key) => {
                                    const order = (b.listData[key].default) ? 1 : 0;
                                    return n + order;
                                }, 0);

                                return (bDefault) ? 1 : (aDefault) ? -1 : 0
                            }

                            return (aOrder < bOrder) ? -1 : (aOrder > bOrder) ? 1 : 0;
                        })

                    }
                }

            }

            if (dataToClient._fieldsToBuilder){
                dataToClient.query = tryBuildAQueryFromClientData({dataToClient}).query;
            }

            if (!DEV) {
                delete dataToClient._kind;
                delete dataToClient._requestName;
                delete dataToClient._args;
                delete dataToClient._argsToBuilder;
                delete dataToClient._fields;
                delete dataToClient._fieldsToBuilder;
            }

            JSON.stringify(dataToClient);

            resolver.toClient = function () {
                return dataToClient;
            }

        } catch (e){
            console.log(e)
        }

    }

}
