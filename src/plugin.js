const MemoryFS = require("memory-fs");
const webpack = require("webpack");

let installer = require("./installer");
let utils = require("./utils");


var depFromErr = function(err) {
    if (!err) {
        return undefined;
    }

    /**
     * Supported package formats:
     * - path
     * - react-lite
     * - @cycle/core
     * - bootswatch/lumen/bootstrap.css
     * - lodash.random
     */
    var matches = /(?:(?:Cannot resolve module)|(?:Can't resolve)) '([@\w\/\.-]+)' in/.exec(
        err
    );

    if (!matches) {
        return undefined;
    }

    return matches[1];
};

class NpmInstallPlugin {
    constructor(options) {
        this.preCompiler = null;
        this.compiler = null;
        this.options = Object.assign(installer.defaultOptions, options);
        this.resolving = {};

        installer.checkBabel(this.options);
    }

    apply(compiler) {
        this.compiler = compiler;

        compiler.hooks.watchRun.tapAsync(
            "NpmInstallPlugin",
            this.preCompile.bind(this)
        );

        if (Array.isArray(compiler.options.externals)) {
            compiler.options.externals.unshift(this.resolveExternal.bind(this));
        }

        compiler.hooks.afterResolvers.tap("NpmInstallPlugin", compiler => {
            // Install loaders on demand
            compiler.resolverFactory.hooks.resolver.tap(
                "loader",
                "NpmInstallPlugin",
                resolver => {
                    resolver.hooks.module.tapAsync(
                        "NpmInstallPlugin",
                        this.resolveLoader.bind(this)
                    );
                }
            );

            // Install project dependencies on demand
            compiler.resolverFactory.hooks.resolver.tap(
                "normal",
                "NpmInstallPlugin",
                resolver => {
                    resolver.hooks.module.tapAsync(
                        "NpmInstallPlugin",
                        this.resolveModule.bind(this)
                    );
                }
            );
        });
    }

    preCompile(compilation, next) {
        if (!this.preCompiler) {
            var options = this.compiler.options;
            var config = Object.assign(
                // Start with new config object
                {},
                // Inherit the current config
                options,
                {
                    // Ensure fresh cache
                    cache: {},
                    // Register plugin to install missing deps
                    plugins: [new NpmInstallPlugin(this.options)]
                }
            );

            this.preCompiler = webpack(config);
            this.preCompiler.outputFileSystem = new MemoryFS();
        }

        this.preCompiler.run(next);
    }

    resolveExternal(context, request, callback) {
        // Only install direct dependencies, not sub-dependencies
        if (context.match("node_modules")) {
            return callback();
        }

        // Ignore !!bundle?lazy!./something
        if (request.match(/(\?|\!)/)) {
            return callback();
        }

        var result = {
            context: {},
            path: context,
            request: request
        };

        this.resolve(
            "normal",
            result,
            function(err, filepath) {
                if (err) {
                    this.install(
                        Object.assign({}, result, { request: depFromErr(err) })
                    );
                }

                callback();
            }.bind(this)
        );
    }

    install(result) {
        if (!result) {
            return;
        }

        var dep = installer.check(result.request);

        if (dep) {
            var dev = this.options.dev;

            if (typeof this.options.dev === "function") {
                dev = !!this.options.dev(result.request, result.path);
            }

            Object.keys(this.options.deps).forEach(k => {
                if (k == dep) {
                    dep = [dep].concat(this.options.deps[k]);
                }
            });

            installer.install(
                dep,
                Object.assign({}, this.options, { dev: dev })
            );
        }
    }

    resolve(resolver, result, callback) {
        var version = require("webpack/package.json").version;
        var major = version.split(".").shift();

        if (major === "4") {
            return this.compiler.resolverFactory
                .get(resolver)
                .resolve(
                    result.context || {},
                    result.path,
                    result.request,
                    {},
                    callback
                );
        }

        throw new Error("Unsupported Webpack version: " + version);
    }

    resolveLoader(result, resolveContext, next) {
        // Only install direct dependencies, not sub-dependencies
        if (result.path.match("node_modules")) {
            return next();
        }

        if (this.resolving[result.request]) {
            return next();
        }

        this.resolving[result.request] = true;

        this.resolve(
            "loader",
            result,
            function(err, filepath) {
                this.resolving[result.request] = false;

                if (err) {
                    var loader = utils.normalizeLoader(result.request);
                    this.install(
                        Object.assign({}, result, { request: loader })
                    );
                }

                return next();
            }.bind(this)
        );
    }

    resolveModule(result, resolveContext, next) {
        if (result.path.match("node_modules")) {
            return next();
        }

        if (this.resolving[result.request]) {
            return next();
        }

        this.resolving[result.request] = true;

        this.resolve(
            "normal",
            result,
            function(err, filepath) {
                this.resolving[result.request] = false;

                if (err) {
                    this.install(
                        Object.assign({}, result, { request: depFromErr(err) })
                    );
                }

                return next();
            }.bind(this)
        );
    }
}


module.exports = NpmInstallPlugin;
