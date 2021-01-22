import * as gqlQueryBuilder from "gql-query-builder";

function recursiveDataToClient(object, saveFields, required) {

    Object.keys(object).forEach(function (resPropKey){

        if (resPropKey === "ofType" || resPropKey === "type"){

            if (object[resPropKey].ofType){
                recursiveDataToClient(object[resPropKey], saveFields, true)
            } else {

                saveFields.fields = {};
                saveFields.required = required;
                saveFields.typeName =
                    saveFields.typeName ||
                    (object[resPropKey] && object[resPropKey]._gqType) ||
                    (object[resPropKey] && object[resPropKey].getType && object[resPropKey].getType()._gqType) ||
                    (object[resPropKey] && object[resPropKey].getName && object[resPropKey].getName()) ||
                    (object[resPropKey] && object[resPropKey].getType && object[resPropKey].getType().name) ||
                    object[resPropKey].typeName ||
                    object[resPropKey].name;

                let fields = object[resPropKey];

                if (object[resPropKey].toConfig) {
                    fields = object[resPropKey].toConfig().fields;
                }

                if (object[resPropKey].getFields) {
                    fields = object[resPropKey].getFields();
                }

                if (!fields.schemaComposer){

                    Object.keys(fields).forEach(function (fieldName) {

                        const isObject = !!(
                            (fields[fieldName] &&
                                fields[fieldName].type &&
                                fields[fieldName].type.getFields)
                        )

                        const hasOftype = !!(
                            (fields[fieldName] &&
                                fields[fieldName].ofType)
                        )

                        const typeString =
                            (fields[fieldName] &&
                                fields[fieldName].type && fields[fieldName].type._gqType) ? fields[fieldName].type._gqType :
                                (fields[fieldName] && fields[fieldName].type && fields[fieldName].type.getTypeName) ?
                                    fields[fieldName].type.getTypeName() :
                                    fields[fieldName].type;

                        saveFields.fields[fieldName] = (isObject || hasOftype) ? {} : (typeString) ? typeString : fields[fieldName];

                        if (isObject) {
                            recursiveDataToClient(fields[fieldName], saveFields.fields[fieldName])
                        }

                        if (hasOftype) {
                            recursiveDataToClient(fields[fieldName], saveFields.fields[fieldName])
                        }

                    })

                } else {
                    delete saveFields.fields;
                }

            }

        }

    })
}
function recursiveFieldsToBuilder(object, saveFields) {
    Object.keys(object).forEach(function (resPropKey){
        if (resPropKey === "fields"){
            const fieldsData = {
                [resPropKey]: []
            }
            recursiveFieldsToBuilder(object[resPropKey], fieldsData[resPropKey])
            saveFields.push(fieldsData)
        } else {
            if (object[resPropKey] && object[resPropKey].fields){
                const fieldsData = {
                    [resPropKey]: []
                }
                recursiveFieldsToBuilder(object[resPropKey].fields, fieldsData[resPropKey])
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
            if (object[resPropKey] && object[resPropKey].fields){
                if (deep === 0) {
                    saveFields[resPropKey] = {
                        value: {}
                    }
                    if (object[resPropKey].typeName){
                        saveFields[resPropKey].type = object[resPropKey].typeName;
                    }
                    if (object[resPropKey].required){
                        saveFields[resPropKey].required = true;
                    }
                    recursiveArgsToBuilder(object[resPropKey].fields, saveFields[resPropKey].value, deep + 1)
                } else {
                    saveFields[resPropKey] = {};
                    recursiveArgsToBuilder(object[resPropKey].fields, saveFields[resPropKey], deep + 1)
                }
            } else if (typeof object[resPropKey] == "object" && object[resPropKey].typeName){
                saveFields[resPropKey] = {};
                if (object[resPropKey].typeName){
                    saveFields[resPropKey].type = object[resPropKey].typeName;
                }
                if (object[resPropKey].required){
                    saveFields[resPropKey].required = true;
                }
            } else {
                saveFields[resPropKey] = object[resPropKey]
            }
        }
    })
}
function tryBuildAQueryFromClientData(p = {}) {
    const {dataToClient = {}} = p;
    const {kind} = dataToClient;
    let buildedQuery;
    try {
        if (gqlQueryBuilder && gqlQueryBuilder[kind]){

            const config = {
                operation: dataToClient.requestName || dataToClient.name,
                fields: dataToClient.fieldsToBuilder,
            }

            if (dataToClient.argsToBuilder){
                config.variables = dataToClient.argsToBuilder;
            }

            buildedQuery = gqlQueryBuilder[kind](config)

            if (buildedQuery.query){
                buildedQuery.query = buildedQuery.query.replace(/\n/g, " ").replace(/\s\s+/g, " ")
            }

        }
    } catch (e){
        console.log(e)
    }

    return buildedQuery;
}

export default function tryCreateDefaultToClient(p = {}) {

    const {resolver, DEV} = p;

    if (resolver && !resolver.toClient){

        try {

            const dataToClient = {
                kind: resolver.kind,
                requestName: resolver.requestName || resolver.name
            }

            recursiveDataToClient(resolver, dataToClient);

            delete dataToClient.typeName;

            if (dataToClient.fields){
                dataToClient.fieldsToBuilder = [];
                recursiveFieldsToBuilder(dataToClient.fields, dataToClient.fieldsToBuilder);
            }

            if (resolver.args && Object.keys(resolver.args).length) {
                dataToClient.args = {};
                Object.keys(resolver.args).forEach(function (key) {
                    if (typeof resolver.args[key] == "string"){
                        dataToClient.args[key] = {
                            typeName: resolver.args[key]
                        }
                    } else {
                        dataToClient.args[key] = {};
                        recursiveDataToClient(resolver.args[key], dataToClient.args[key]);
                    }
                })
                if (dataToClient.fields) {
                    dataToClient.argsToBuilder = {};
                    recursiveArgsToBuilder(dataToClient.args, dataToClient.argsToBuilder);
                }
            }

            if (dataToClient.fieldsToBuilder){
                dataToClient.buildQuery = tryBuildAQueryFromClientData({dataToClient})
            }

            if (!DEV) {
                delete dataToClient.args;
                delete dataToClient.argsToBuilder;
                delete dataToClient.fields;
                delete dataToClient.fieldsToBuilder;
            }

            JSON.stringify(dataToClient)

            resolver.toClient = function () {
                return dataToClient;
            }

        } catch (e){
            //console.log(e)
        }

    }

}
