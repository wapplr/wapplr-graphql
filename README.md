# Wapplr-graphql

This package is the [GraphQl](https://github.com/graphql) extension for [Wapplr](https://github.com/wapplr/wapplr).

```js
//server.js
import wapplrGraphql, {createMiddleware as createWapplrGraphqlMiddleware} from "wapplr-graphql";
import wapplrServer from "wapplr";

const wapp = wapplrServer({config: {
        server: {
            disableUseDefaultMiddlewares: true,
            graphql: {
                route: "/graphql",
            }
        },
        globals: {
            WAPP: "yourBuildHash",
            ROOT: __dirname
        }
    }
});

wapplrGraphql({wapp});

const app = wapp.server.app; 

app.use([
    wapp.server.middlewares.wapp,
    wapp.server.middlewares.static,
    createWapplrGraphqlMiddleware({wapp}),
    ...Object.keys(wapp.server.middlewares).map(function (key){
        return (key === "wapp" && key === "static") ? 
            function next(req, res, next) { return next(); } : 
            wapp.server.middlewares[key];
    })
]);

wapp.server.listen();
```

## License

MIT
