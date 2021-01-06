# Wapplr-graphql

This package is the [GraphQl](https://github.com/graphql) extension for [Wapplr](https://github.com/wapplr/wapplr).

```js
//server.js
import wapplrGraphql from "wapplr-graphql";
import wapplrServer from "wapplr";
const wapp = wapplrServer({config: {
        server: {
            graphqlConfig: {
                graphqlRoute: "/graphql",
            }
        },
        globals: {
            WAPP: "yourBuildHash",
            ROOT: __dirname
        }
    }
});
await wapplrGraphql({wapp});
wapp.server.listen();
```

## License

MIT
