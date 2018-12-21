> 对`npm-install-webpack-plugin`的功能加强，额外添加两个参数`deps`, `registry`和`babel`

### registry

> 方便公司内网使用

### deps

> 由于`npm-install-webpack-plugin`在安装`less-loader`时不能自动安装`less`,所以添加此参数来弥补。

-   默认：

```js
{
    "less-loader": ["less"],
    "sass-loader": ["node-sass"],
    "eslint-loader": ["eslint"],
    "babel-loader": ["@babel/core", "@babel/preset-env"],
    "ts-loader": ["typescript"]
}
```

### babel

> 由于`npm-install-webpack-plugin`检测 babel 时，只对`.babelrc`进行检测，不能满足需求，所以添加此参数来弥补。

```js
plugins: [
  new NpmInstallPlugin({
    babel: {
        "presets": [
            ["env", {
                "modules": false
            }],
            "stage-2"
        ]
    }
],
```
