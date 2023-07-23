export function createRequests(p = {}) {

    const {wapp, res} = p;

    const target = wapp.getTargetObject();
    const globalGraphqlConfig = (target.config && target.config.graphql) ? target.config.graphql : {};
    const requestManager = wapp.requests.requestManager;

    const {
        route = "/graphql",
    } = globalGraphqlConfig;

    const graphql = res.wappResponse.store.getState("res.graphql") || {};

    function addRequest(resolver, requestName) {

        const url = resolver.url || route;
        const query = resolver.query;

        if (query && !requestManager.requests[requestName]) {
            const options = {
                getBody: function getBody(p = {}) {
                    if (p.multipart){
                        let formData = typeof FormData !== 'undefined' ? new FormData() : null;
                        const r = {
                            query: query,
                            variables: p.args || {},
                        };
                        if (formData) {
                            formData.append("operations", JSON.stringify(r));
                        }
                        if (p.callbackMultipartFormData){
                            const newFormData = p.callbackMultipartFormData({formData, body: {operations: r}});
                            if (newFormData) {
                                formData = newFormData;
                            }
                        }
                        return formData;
                    }
                    const r = {
                        query: query,
                        variables: p.args || {},
                    };
                    return JSON.stringify(r);
                }
            };
            requestManager.setNewRequest({requestName, url, options})
        }
    }

    if (graphql.mutation){
        Object.keys(graphql.mutation).forEach(function (requestName) {
            addRequest(graphql.mutation[requestName], requestName)
        })
    }

    if (graphql.query){
        Object.keys(graphql.query).forEach(function (requestName) {
            addRequest(graphql.query[requestName], requestName)
        })
    }

}
