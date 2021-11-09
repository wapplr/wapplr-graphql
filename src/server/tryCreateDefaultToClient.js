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

function recursiveArgsToFormData(resolverProperties = {}, jsonSchema = {}, object, saveFields, parentKey = "") {

    Object.keys(object).forEach(function (resPropKey){

        if (resPropKey === "fields"){
            recursiveArgsToFormData(resolverProperties, jsonSchema[resPropKey], object[resPropKey], saveFields, resPropKey);
        } else {

            const nextKey = (parentKey) ? parentKey + "." + resPropKey : resPropKey;

            const schemaObject = jsonSchema[resPropKey] || {};
            const resolverPropertiesObject = resolverProperties[resPropKey] || {};

            if (object[resPropKey] && object[resPropKey].fields){
                const nextSchema = (resPropKey === "record") ? jsonSchema : schemaObject.properties;
                recursiveArgsToFormData(resolverPropertiesObject, nextSchema, object[resPropKey].fields, saveFields, nextKey)
            } else {

                saveFields[nextKey] = {};
                if (schemaObject?.wapplr?.formData){
                    saveFields[nextKey] = {...schemaObject.wapplr.formData};
                }

                if (resolverPropertiesObject.wapplr?.formData){
                    saveFields[nextKey] = {...resolverPropertiesObject.wapplr.formData};
                }

                if (schemaObject && schemaObject["x-ref"] && !saveFields[nextKey].refPostType){
                    saveFields[nextKey].refPostType = schemaObject["x-ref"].toLowerCase();
                }

                if (typeof object[resPropKey] == "object" && object[resPropKey].typeName) {

                    if (object[resPropKey].typeName){
                        saveFields[nextKey].schemaType = (object[resPropKey].typeName.toString) ? object[resPropKey].typeName.toString() : object[resPropKey].typeName;
                    }
                    if (object[resPropKey].list){
                        saveFields[nextKey].multiple = true;
                    }
                    if (object[resPropKey].required && !object[resPropKey].list){
                        saveFields[nextKey].required = true;

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
                        }

                    }

                    if (object[resPropKey].list && object[resPropKey].listIsRequired) {
                        saveFields[nextKey].required = true;
                        saveFields[nextKey].default = [];
                    }

                } else {
                    saveFields[nextKey].schemaType = object[resPropKey]
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
            const {maxDepth = 5} = resolverProperties || {};

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

                            let fields = null;

                            if (object[resPropKey].toConfig) {
                                fields = {...object[resPropKey].toConfig().fields}
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

                            if (fields && Object.keys(fields).length){

                                const enableIndex = Object.keys(fields).indexOf("_id") > -1 ? Object.keys(fields).indexOf("_id") : 0;
                                Object.keys(fields).forEach(function (fieldName, i) {

                                    if (depth < maxDepth || i === enableIndex ){

                                        const typeString =
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

                                        if (isObject) {
                                            recursiveDataToClient(GraphQLSchema, schemaComposer, fields[fieldName], saveFields.fields[fieldName], false, 0, depth+1)
                                        } else if (listType) {
                                            recursiveDataToClient(GraphQLSchema, schemaComposer, fields[fieldName], saveFields.fields[fieldName], false, 1, depth)
                                        } else if (nonNullComposer) {
                                            recursiveDataToClient(GraphQLSchema, schemaComposer, fields[fieldName], saveFields.fields[fieldName], true, 0, depth)
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
