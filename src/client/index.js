import wapplrClient from "wapplr";
import initGraphql from "./initGraphql";

export default function createClient(p) {
    const wapp = p.wapp || wapplrClient({...p});
    return initGraphql({wapp, ...p});
}

export function createMiddleware(p = {}) {
    return function graphqlMiddleware(req, res, next) {
        const wapp = req.wapp || p.wapp || createClient(p).wapp;
        const graphql = initGraphql({wapp, ...p});
        return graphql.middleware(req, res, next);
    }
}

const defaultConfig = {
    config: {
        globals: {
            DEV: (typeof DEV !== "undefined") ? DEV : undefined,
            WAPP: (typeof WAPP !== "undefined") ? WAPP : undefined,
            RUN: (typeof RUN !== "undefined") ? RUN : undefined,
            TYPE: (typeof TYPE !== "undefined") ? TYPE : undefined,
            ROOT: (typeof ROOT !== "undefined") ? ROOT : "/",
            NAME: (typeof NAME !== "undefined") ? NAME : undefined,
        }
    }
};

export function run(p = defaultConfig) {

    const wapp = createClient(p).wapp;
    const globals = wapp.globals;
    const {DEV} = globals;

    const app = wapp.client.app;
    app.use(createMiddleware({wapp, ...p}));
    wapp.client.listen();

    if (typeof DEV !== "undefined" && DEV && module.hot){
        app.hot = module.hot;
        module.hot.accept();
    }

    return wapp;
}

if (typeof RUN !== "undefined" && RUN === "wapplr-graphql") {
    run();
}
