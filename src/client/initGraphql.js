import {defaultDescriptor} from "../common/utils";
import {createRequests} from "../common";

export default function initGraphql(p = {}) {

    const {wapp} = p;
    const {client} = wapp;

    if (!client.graphql) {

        function defaultMiddleware(req, res, next) {
            client.graphql.init();
            return next();
        }

        function defaultInit() {
            if (wapp.states) {
                wapp.states.addHandle({
                    requestsFromGraphQl: function requestsFromGraphQl(req, res, next) {
                        createRequests({wapp, req, res});
                        next();
                    }
                })
            }
        }

        const defaultGraphqlObject =  Object.create(Object.prototype, {
            middleware: {
                ...defaultDescriptor,
                value: defaultMiddleware
            },
            init: {
                ...defaultDescriptor,
                value: defaultInit
            },
        });

        Object.defineProperty(client, "graphql", {
            ...defaultDescriptor,
            writable: false,
            value: defaultGraphqlObject
        });

        Object.defineProperty(client.graphql, "wapp", {...defaultDescriptor, writable: false, enumerable: false, value: wapp});

        client.graphql.init();

    }

    return client.graphql;

}
