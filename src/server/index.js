import wapplrServer from 'wapplr';
import initGraphql from "./initGraphql";

export default function createServer(p = {}) {
    const wapp = p.wapp || wapplrServer({...p});
    initGraphql({wapp, ...p});
    return wapp;
}

export function createMiddleware(p = {}) {
    return function graphqlMiddleware(req, res, next) {
        const wapp = req.wapp || p.wapp || createServer(p);
        const graphql = wapp.server.graphql || initGraphql({wapp, ...p});
        return graphql.middleware(req, res, next)
    }
}

export function run(p = {}) {

    const wapp = createServer(p);
    const globals = wapp.globals;
    const {DEV} = globals;

    const app = wapp.server.app;
    if (typeof DEV !== "undefined" && DEV && module.hot) {
        app.hot = module.hot;
    }
    app.use(createMiddleware({wapp, ...p}));
    wapp.server.listen();

    if (typeof DEV !== "undefined" && DEV && module.hot){
        module.hot.accept("./index");
    }

    return wapp;

}

if (typeof RUN !== "undefined" && RUN === "wapplr-graphql") {
    run({
        config: {
            globals: {
                DEV: (typeof DEV !== "undefined") ? DEV : undefined,
                WAPP: (typeof WAPP !== "undefined") ? WAPP : undefined,
                RUN: (typeof RUN !== "undefined") ? RUN : undefined,
                TYPE: (typeof TYPE !== "undefined") ? TYPE : undefined,
            }
        }
    });
}
