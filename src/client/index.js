import wapplrClient from "wapplr";

export default function createClient(p) {
    console.log("[wapplr-graphql] There is not client side module in this package")
    return p.wapp || wapplrClient({...p});
}

export function createMiddleware(p = {}) {
    // noinspection JSUnusedAssignment,JSUnusedLocalSymbols
    return function graphqlMiddleware(req, res, next) {
        // eslint-disable-next-line no-unused-vars
        const wapp = req.wapp || p.wapp || createClient(p);
        console.log("[wapplr-graphql] There is not client side module in this package")
        next();
    }
}

export function run(p = {}) {

    const wapp = createClient(p);
    const globals = wapp.globals;
    const {DEV} = globals;

    const app = wapp.client.app;

    app.use(createMiddleware({wapp, ...p}))

    wapp.client.listen();

    if (typeof DEV !== "undefined" && DEV && module.hot){
        module.hot.accept();
    }

    return wapp;
}

if (typeof RUN !== "undefined" && RUN === "wapplr-graphql") {
    run();
}
