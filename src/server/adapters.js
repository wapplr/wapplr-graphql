import OperationType from "gql-query-builder/build/OperationType";
import Utils from "gql-query-builder/build/Utils";

function isNestedField(object) {
    return (
        typeof object === "object" &&
        object.hasOwnProperty("operation") &&
        object.hasOwnProperty("variables") &&
        object.hasOwnProperty("fields")
    );
}

function queryDataNameAndArgumentMap(variables) {
    return variables && Object.keys(variables).length
        ? `(${Object.entries(variables).reduce((dataString, [key, value], i) => {
            return `${dataString}${i !== 0 ? ", " : ""}${value && value.name ? value.name : key}: $${key}`;
        }, "")})`
        : "";
}

function queryFieldsMap(fields) {
    return fields
        ? fields
            .map((field) => {
                if (isNestedField(field)) {
                    return queryNestedFieldMap(field);
                } else if (typeof field === "object") {
                    const values = Object.values(field)[0];
                    return `${Object.keys(field)[0]} ${
                        values.length > 0
                            ? "{ " + queryFieldsMap(values) + " }"
                    : ""
                    }`;
                } else {
                    return `${field}`;
                }
            })
            .join(", ")
        : "";
}

function queryNestedFieldMap(field) {

    const unionSpreadStringOrJustOperationName = (field.union) ? `... on ${field.operation.charAt(0).toUpperCase() + field.operation.substring(1)}` : field.operation;

    return `${unionSpreadStringOrJustOperationName} ${queryDataNameAndArgumentMap(
        field.variables
    )} ${
        field.fields.length > 0
            ? "{ " + queryFieldsMap(field.fields) + " }"
            : ""
    }`;
}

export class QueryAdapter {
    constructor(options, configuration) {
        // Default configs
        this.config = {
            operationName: "",
        };
        if (configuration) {
            Object.entries(configuration).forEach(([key, value]) => {
                this.config[key] = value;
            });
        }
        if (Array.isArray(options)) {
            this.variables = Utils.resolveVariables(options);
        }
        else {
            this.variables = options.variables;
            this.fields = options.fields || [];
            this.operation = options.operation;
        }
    }
    // kicks off building for a single query
    queryBuilder() {
        return this.operationWrapperTemplate(this.operationTemplate(this.variables));
    }
    // if we have an array of options, call this
    queriesBuilder(queries) {
        const content = () => {
            const tmpl = [];
            queries.forEach((query) => {
                if (query) {
                    this.operation = query.operation;
                    this.fields = query.fields;
                    tmpl.push(this.operationTemplate(query.variables));
                }
            });
            return tmpl.join(" ");
        };
        return this.operationWrapperTemplate(content());
    }
    // Convert object to argument and type map. eg: ($id: Int)
    queryDataArgumentAndTypeMap() {
        let variablesUsed = this.variables;
        if (this.fields && typeof this.fields === "object") {
            variablesUsed = Object.assign(Object.assign({}, Utils.getNestedVariables(this.fields)), variablesUsed);
        }
        return variablesUsed && Object.keys(variablesUsed).length > 0
            ? `(${Object.keys(variablesUsed).reduce((dataString, key, i) => `${dataString}${i !== 0 ? ", " : ""}$${key}: ${Utils.queryDataType(variablesUsed[key])}`, "")})`
            : "";
    }
    operationWrapperTemplate(content) {
        let query = `${OperationType.Query} ${this.queryDataArgumentAndTypeMap()} { ${content} }`;
        query = query.replace("query", `query${this.config.operationName !== "" ? " " + this.config.operationName : ""}`);
        return {
            query,
            variables: Utils.queryVariablesMap(this.variables, this.fields),
        };
    }
    // query
    operationTemplate(variables) {
        return `${this.operation} ${variables ? Utils.queryDataNameAndArgumentMap(variables) : ""} ${this.fields && this.fields.length > 0 ? "{ " + queryFieldsMap(this.fields) + " }" : ""}`;}
}

export class MutationAdapter {
    constructor(options) {
        if (Array.isArray(options)) {
            this.variables = Utils.resolveVariables(options);
        }
        else {
            this.variables = options.variables;
            this.fields = options.fields;
            this.operation = options.operation;
        }
    }
    mutationBuilder() {
        return this.operationWrapperTemplate(OperationType.Mutation, this.variables, this.operationTemplate(this.operation));
    }
    mutationsBuilder(mutations) {
        const content = mutations.map((opts) => {
            this.operation = opts.operation;
            this.variables = opts.variables;
            this.fields = opts.fields;
            return this.operationTemplate(opts.operation);
        });
        return this.operationWrapperTemplate(OperationType.Mutation, Utils.resolveVariables(mutations), content.join("\n  "));
    }
    // Convert object to name and argument map. eg: (id: $id)
    queryDataNameAndArgumentMap() {
        return this.variables && Object.keys(this.variables).length
            ? `(${Object.keys(this.variables).reduce((dataString, key, i) => `${dataString}${i !== 0 ? ", " : ""}${key}: $${key}`, "")})`
            : "";
    }
    queryDataArgumentAndTypeMap(variablesUsed) {
        if (this.fields && typeof this.fields === "object") {
            variablesUsed = Object.assign(Object.assign({}, Utils.getNestedVariables(this.fields)), variablesUsed);
        }
        return variablesUsed && Object.keys(variablesUsed).length > 0
            ? `(${Object.keys(variablesUsed).reduce((dataString, key, i) => `${dataString}${i !== 0 ? ", " : ""}$${key}: ${Utils.queryDataType(variablesUsed[key])}`, "")})`
            : "";
    }
    operationWrapperTemplate(type, variables, content) {
        return {
            query: `${type} ${this.queryDataArgumentAndTypeMap(variables)} {${content}}`,
            variables: Utils.queryVariablesMap(variables, this.fields),
        };
    }
    operationTemplate(operation) {
        return `${operation} ${this.queryDataNameAndArgumentMap()} ${this.fields && this.fields.length > 0 ? `{${queryFieldsMap(this.fields)}}` : ""}`;
    }
}
