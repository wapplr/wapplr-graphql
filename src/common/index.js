export function createRequests(p = {}) {

    const {wapp, req, res} = p;

    const state = res.wappResponse.state;
    const target = wapp.getTargetObject();
    const globalGraphqlConfig = (target.config && target.config.graphql) ? target.config.graphql : {};
    const requestManager = wapp.requests.requestManager;

    const {
        route = "/graphql",
    } = globalGraphqlConfig;

    const {graphql = {}} = state.res;

    function addRequest(resolver, requestName) {

        const url = resolver.url || route;
        const query = resolver.query;

        if (query && !requestManager.requests[requestName]) {
            const options = {
                getBody: function getBody(p = {}) {
                    const r = {
                        query: query,
                        variables: p.args || {}
                    }

                    return JSON.stringify(r);
                }
            }
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
