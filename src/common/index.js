export function createRequests(p = {}) {

    const {wapp} = p;

    const state = wapp.response.state;
    const target = wapp.getTargetObject();
    const globalGraphqlConfig = (target.config && target.config.graphql) ? target.config.graphql : {};
    const requestManager = wapp.requests.requestManager;

    const {
        route = "/graphql",
    } = globalGraphqlConfig;

    const {res = {}} = state;
    const {graphql = {}} = res;

    function addRequest(resolver) {

        const requestName = resolver.requestName;
        const url = resolver.url || route;
        const buildQuery = resolver.buildQuery;

        if (buildQuery && !requestManager.requests[requestName]) {
            const options = {
                getBody: function getBody(p = {}) {
                    const r = {
                        query: buildQuery.query,
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
            addRequest(graphql.mutation[requestName])
        })
    }

    if (graphql.query){
        Object.keys(graphql.query).forEach(function (requestName) {
            addRequest(graphql.query[requestName])
        })
    }

}
