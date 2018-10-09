const MemoryFS = require("memory-fs");
const webpack = require("webpack");

let installer = require("./installer");
let utils = require("./utils");

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

        compiler.hooks.afterResolvers.tap("NpmInstallPlugin", function(compiler) {
            // Install loaders on demand
            this.plugin("resolver loader", compiler);

            // Install project dependencies on demand
            this.plugin("resolver normal", compiler);
        }.bind(this))
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
            })
    
            installer.install(dep, Object.assign({}, this.options, { dev: dev }));
        }
    }

    plugin(name, compiler) {
        compiler.resolverFactory._pluginCompat.call({
            name: name,
            fn: (resolver) => {
                resolver.getHook("noResolve").tap("NpmInstallPlugin",  (request, error)=> {
                    if (error) {
                        this.install(request);
                    }
                });
            },
            names: new Set([name])
        });
    }
}

module.exports = NpmInstallPlugin;
