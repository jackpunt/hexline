const config = {
    "mode": "development",
    "devtool": false,
    "target": ["web",
        "es2015"],
    "profile": false,
    "resolve": {
        "roots": ["/Users/jpeck/Data/Programs/ng/hexline"],
        "extensions": [".ts",
            ".tsx",
            ".mjs",
            ".js"],
        "symlinks": true,
        "modules": ["/Users/jpeck/Data/Programs/ng/hexline",
            "node_modules"],
        "mainFields": ["es2020",
            "es2015",
            "browser",
            "module",
            "main"],
        "conditionNames": ["es2020",
            "es2015",
            "..."]
    },
    "resolveLoader": { "symlinks": true },
    "context": "/Users/jpeck/Data/Programs/ng/hexline",
    "entry": {
        "main": ["/Users/jpeck/Data/Programs/ng/hexline/src/main.ts"],
        "polyfills": ["/Users/jpeck/Data/Programs/ng/hexline/src/polyfills.ts"],
        "styles": ["/Users/jpeck/Data/Programs/ng/hexline/src/styles.css"]
    },
    "externals": [],
    "output": {
        "uniqueName": "hexline",
        "hashFunction": "xxhash64",
        "clean": true,
        "path": "/Users/jpeck/Data/Programs/ng/hexline/dist/hexline",
        "publicPath": "",
        "filename": "[name].js",
        "chunkFilename": "[name].js",
        "crossOriginLoading": false,
        "trustedTypes": "angular#bundler",
        "scriptType": "module"
    },
    "watch": false,
    "watchOptions": {},
    "performance": { "hints": false },
    "ignoreWarnings": [{}, {}, {}],
    "module": {
        "strictExportPresence": true,
        "parser": {
            "javascript": {
                "url": false,
                "worker": true
            }
        },
        "rules": [{
            "test": {},
            "resourceQuery": {},
            "type": "asset/source"
        }, {
            "test": {},
            "sideEffects": true
        }, {
            "test": {},
            "resolve": { "fullySpecified": false },
            "exclude": [{}],
            "use": [{
                "loader": "/Users/jpeck/Data/Programs/ng/hexline/node_modules/@angular-devkit/build-angular/src/babel/webpack-loader.js",
                "options": {
                    "cacheDirectory": "/Users/jpeck/Data/Programs/ng/hexline/.angular/cache/13.2.6/babel-webpack",
                    "scriptTarget": 8,
                    "aot": true,
                    "optimize": false
                }
            }]
        }, {
            "test": {},
            "enforce": "pre",
            "loader": "/Users/jpeck/Data/Programs/ng/hexline/node_modules/source-map-loader/dist/cjs.js",
            "options": {}
        }, {
            "test": {},
            "loader": "/Users/jpeck/Data/Programs/ng/hexline/node_modules/@ngtools/webpack/src/ivy/index.js",
            "exclude": [{}]
        }, {
            "test": {},
            "rules": [{
                "oneOf": [{
                    "use": [{ "loader": "/Users/jpeck/Data/Programs/ng/hexline/node_modules/mini-css-extract-plugin/dist/loader.js" }, {
                        "loader": "/Users/jpeck/Data/Programs/ng/hexline/node_modules/css-loader/dist/cjs.js",
                        "options": {
                            "url": false,
                            "sourceMap": true
                        }
                    }, {
                        "loader": "/Users/jpeck/Data/Programs/ng/hexline/node_modules/postcss-loader/dist/cjs.js",
                        "options": { "sourceMap": true }
                    }],
                    "include": ["/Users/jpeck/Data/Programs/ng/hexline/src/styles.css"],
                    "resourceQuery": { "not": [{}] }
                }, {
                    "use": [{
                        "loader": "/Users/jpeck/Data/Programs/ng/hexline/node_modules/postcss-loader/dist/cjs.js",
                        "options": {}
                    }],
                    "type": "asset/source"
                }]
            }, { "use": [] }]
        }, {
            "test": {},
            "rules": [{
                "oneOf": [{
                    "use": [{ "loader": "/Users/jpeck/Data/Programs/ng/hexline/node_modules/mini-css-extract-plugin/dist/loader.js" }, {
                        "loader": "/Users/jpeck/Data/Programs/ng/hexline/node_modules/css-loader/dist/cjs.js",
                        "options": {
                            "url": false,
                            "sourceMap": true
                        }
                    }, {
                        "loader": "/Users/jpeck/Data/Programs/ng/hexline/node_modules/postcss-loader/dist/cjs.js",
                        "options": { "sourceMap": true }
                    }],
                    "include": ["/Users/jpeck/Data/Programs/ng/hexline/src/styles.css"],
                    "resourceQuery": { "not": [{}] }
                }, {
                    "use": [{
                        "loader": "/Users/jpeck/Data/Programs/ng/hexline/node_modules/postcss-loader/dist/cjs.js",
                        "options": {}
                    }],
                    "type": "asset/source"
                }]
            }, {
                "use": [{
                    "loader": "/Users/jpeck/Data/Programs/ng/hexline/node_modules/resolve-url-loader/index.js",
                    "options": { "sourceMap": true }
                }, {
                    "loader": "/Users/jpeck/Data/Programs/ng/hexline/node_modules/sass-loader/dist/cjs.js",
                    "options": {
                        "implementation": {
                            "workers": [],
                            "availableWorkers": [],
                            "requests": {},
                            "idCounter": 1,
                            "nextWorkerIndex": 0
                        },
                        "sourceMap": true,
                        "sassOptions": {
                            "fiber": false,
                            "precision": 8,
                            "includePaths": [],
                            "outputStyle": "expanded",
                            "quietDeps": true,
                            "verbose": false
                        }
                    }
                }]
            }]
        }, {
            "test": {},
            "rules": [{
                "oneOf": [{
                    "use": [{ "loader": "/Users/jpeck/Data/Programs/ng/hexline/node_modules/mini-css-extract-plugin/dist/loader.js" }, {
                        "loader": "/Users/jpeck/Data/Programs/ng/hexline/node_modules/css-loader/dist/cjs.js",
                        "options": {
                            "url": false,
                            "sourceMap": true
                        }
                    }, {
                        "loader": "/Users/jpeck/Data/Programs/ng/hexline/node_modules/postcss-loader/dist/cjs.js",
                        "options": { "sourceMap": true }
                    }],
                    "include": ["/Users/jpeck/Data/Programs/ng/hexline/src/styles.css"],
                    "resourceQuery": { "not": [{}] }
                }, {
                    "use": [{
                        "loader": "/Users/jpeck/Data/Programs/ng/hexline/node_modules/postcss-loader/dist/cjs.js",
                        "options": {}
                    }],
                    "type": "asset/source"
                }]
            }, {
                "use": [{
                    "loader": "/Users/jpeck/Data/Programs/ng/hexline/node_modules/resolve-url-loader/index.js",
                    "options": { "sourceMap": true }
                }, {
                    "loader": "/Users/jpeck/Data/Programs/ng/hexline/node_modules/sass-loader/dist/cjs.js",
                    "options": {
                        "implementation": {
                            "workers": [],
                            "availableWorkers": [],
                            "requests": {},
                            "idCounter": 1,
                            "nextWorkerIndex": 0
                        },
                        "sourceMap": true,
                        "sassOptions": {
                            "fiber": false,
                            "indentedSyntax": true,
                            "precision": 8,
                            "includePaths": [],
                            "outputStyle": "expanded",
                            "quietDeps": true,
                            "verbose": false
                        }
                    }
                }]
            }]
        }, {
            "test": {},
            "rules": [{
                "oneOf": [{
                    "use": [{ "loader": "/Users/jpeck/Data/Programs/ng/hexline/node_modules/mini-css-extract-plugin/dist/loader.js" }, {
                        "loader": "/Users/jpeck/Data/Programs/ng/hexline/node_modules/css-loader/dist/cjs.js",
                        "options": {
                            "url": false,
                            "sourceMap": true
                        }
                    }, {
                        "loader": "/Users/jpeck/Data/Programs/ng/hexline/node_modules/postcss-loader/dist/cjs.js",
                        "options": { "sourceMap": true }
                    }],
                    "include": ["/Users/jpeck/Data/Programs/ng/hexline/src/styles.css"],
                    "resourceQuery": { "not": [{}] }
                }, {
                    "use": [{
                        "loader": "/Users/jpeck/Data/Programs/ng/hexline/node_modules/postcss-loader/dist/cjs.js",
                        "options": {}
                    }],
                    "type": "asset/source"
                }]
            }, {
                "use": [{
                    "loader": "/Users/jpeck/Data/Programs/ng/hexline/node_modules/less-loader/dist/cjs.js",
                    "options": {
                        "implementation": {
                            "mixin": {},
                            "lesscHelper": {},
                            "fs": {
                                "F_OK": 0,
                                "R_OK": 4,
                                "W_OK": 2,
                                "X_OK": 1,
                                "constants": {
                                    "UV_FS_SYMLINK_DIR": 1,
                                    "UV_FS_SYMLINK_JUNCTION": 2,
                                    "O_RDONLY": 0,
                                    "O_WRONLY": 1,
                                    "O_RDWR": 2,
                                    "UV_DIRENT_UNKNOWN": 0,
                                    "UV_DIRENT_FILE": 1,
                                    "UV_DIRENT_DIR": 2,
                                    "UV_DIRENT_LINK": 3,
                                    "UV_DIRENT_FIFO": 4,
                                    "UV_DIRENT_SOCKET": 5,
                                    "UV_DIRENT_CHAR": 6,
                                    "UV_DIRENT_BLOCK": 7,
                                    "S_IFMT": 61440,
                                    "S_IFREG": 32768,
                                    "S_IFDIR": 16384,
                                    "S_IFCHR": 8192,
                                    "S_IFBLK": 24576,
                                    "S_IFIFO": 4096,
                                    "S_IFLNK": 40960,
                                    "S_IFSOCK": 49152,
                                    "O_CREAT": 512,
                                    "O_EXCL": 2048,
                                    "UV_FS_O_FILEMAP": 0,
                                    "O_NOCTTY": 131072,
                                    "O_TRUNC": 1024,
                                    "O_APPEND": 8,
                                    "O_DIRECTORY": 1048576,
                                    "O_NOFOLLOW": 256,
                                    "O_SYNC": 128,
                                    "O_DSYNC": 4194304,
                                    "O_SYMLINK": 2097152,
                                    "O_NONBLOCK": 4,
                                    "S_IRWXU": 448,
                                    "S_IRUSR": 256,
                                    "S_IWUSR": 128,
                                    "S_IXUSR": 64,
                                    "S_IRWXG": 56,
                                    "S_IRGRP": 32,
                                    "S_IWGRP": 16,
                                    "S_IXGRP": 8,
                                    "S_IRWXO": 7,
                                    "S_IROTH": 4,
                                    "S_IWOTH": 2,
                                    "S_IXOTH": 1,
                                    "F_OK": 0,
                                    "R_OK": 4,
                                    "W_OK": 2,
                                    "X_OK": 1,
                                    "UV_FS_COPYFILE_EXCL": 1,
                                    "COPYFILE_EXCL": 1,
                                    "UV_FS_COPYFILE_FICLONE": 2,
                                    "COPYFILE_FICLONE": 2,
                                    "UV_FS_COPYFILE_FICLONE_FORCE": 4,
                                    "COPYFILE_FICLONE_FORCE": 4
                                },
                                "promises": {}
                            },
                            "options": {
                                "javascriptEnabled": false,
                                "depends": false,
                                "compress": false,
                                "lint": false,
                                "paths": [],
                                "color": true,
                                "strictImports": false,
                                "insecure": false,
                                "rootpath": "",
                                "rewriteUrls": false,
                                "math": 1,
                                "strictUnits": false,
                                "globalVars": null,
                                "modifyVars": null,
                                "urlArgs": ""
                            }
                        },
                        "sourceMap": true,
                        "lessOptions": {
                            "javascriptEnabled": true,
                            "paths": []
                        }
                    }
                }]
            }]
        }, {
            "test": {},
            "rules": [{
                "oneOf": [{
                    "use": [{ "loader": "/Users/jpeck/Data/Programs/ng/hexline/node_modules/mini-css-extract-plugin/dist/loader.js" }, {
                        "loader": "/Users/jpeck/Data/Programs/ng/hexline/node_modules/css-loader/dist/cjs.js",
                        "options": {
                            "url": false,
                            "sourceMap": true
                        }
                    }, {
                        "loader": "/Users/jpeck/Data/Programs/ng/hexline/node_modules/postcss-loader/dist/cjs.js",
                        "options": { "sourceMap": true }
                    }],
                    "include": ["/Users/jpeck/Data/Programs/ng/hexline/src/styles.css"],
                    "resourceQuery": { "not": [{}] }
                }, {
                    "use": [{
                        "loader": "/Users/jpeck/Data/Programs/ng/hexline/node_modules/postcss-loader/dist/cjs.js",
                        "options": {}
                    }],
                    "type": "asset/source"
                }]
            }, {
                "use": [{
                    "loader": "/Users/jpeck/Data/Programs/ng/hexline/node_modules/stylus-loader/dist/cjs.js",
                    "options": {
                        "sourceMap": true,
                        "stylusOptions": {
                            "compress": false,
                            "sourceMap": { "comment": false },
                            "paths": []
                        }
                    }
                }]
            }]
        }]
    },
    "experiments": {
        "backCompat": false,
        "syncWebAssembly": true,
        "asyncWebAssembly": true
    },
    "infrastructureLogging": { "level": "error" },
    "stats": {
        "all": false,
        "colors": true,
        "hash": true,
        "timings": true,
        "chunks": true,
        "builtAt": true,
        "warnings": true,
        "errors": true,
        "assets": true,
        "cachedAssets": true,
        "ids": true,
        "entrypoints": true
    },
    "cache": {
        "type": "filesystem",
        "profile": false,
        "cacheDirectory": "/Users/jpeck/Data/Programs/ng/hexline/.angular/cache/13.2.6/angular-webpack",
        "maxMemoryGenerations": 1,
        "name": "e9a3140f10266f0a3630728fad25517587a7e928"
    },
    "optimization": {
        "minimizer": [],
        "moduleIds": "deterministic",
        "chunkIds": "named",
        "emitOnErrors": false,
        "runtimeChunk": "single",
        "splitChunks": {
            "maxAsyncRequests": null,
            "cacheGroups": {
                "default": {
                    "chunks": "async",
                    "minChunks": 2,
                    "priority": 10
                },
                "common": {
                    "name": "common",
                    "chunks": "async",
                    "minChunks": 2,
                    "enforce": true,
                    "priority": 5
                },
                "vendors": false,
                "defaultVendors": {
                    "name": "vendor",
                    "enforce": true,
                    "test": {}
                }
            }
        }
    },
    "plugins": [{}, {
        "options": { "verbose": false },
        "modules": {}
    }, {
        "profile": false,
        "modulesCount": 5000,
        "dependenciesCount": 10000,
        "showEntries": true,
        "showModules": true,
        "showDependencies": true,
        "showActiveModules": false
    }, {
        "options": {
            "allowedDependencies": ["createjs-module",
                "@thegraid/common-lib"]
        },
        "shownWarnings": {},
        "allowedDependencies": {}
    }, {
        "sourceMapFilename": "[file].map",
        "sourceMappingURLComment": "\n//# sourceMappingURL=[url]",
        "moduleFilenameTemplate": "[resource-path]",
        "fallbackModuleFilenameTemplate": "webpack://[namespace]/[resourcePath]?[hash]",
        "namespace": "",
        "options": {
            "filename": "[file].map",
            "include": [{}, {}],
            "sourceRoot": "webpack:///",
            "moduleFilenameTemplate": "[resource-path]"
        }
    }, {
        "fileDependencies": {},
        "requiredFilesToEmit": {},
        "requiredFilesToEmitCache": {},
        "fileEmitHistory": {},
        "pluginOptions": {
            "emitClassMetadata": false,
            "emitNgModuleScope": true,
            "jitMode": false,
            "fileReplacements": {},
            "substitutions": {},
            "directTemplateLoading": true,
            "tsconfig": "/Users/jpeck/Data/Programs/ng/hexline/tsconfig.app.json",
            "compilerOptions": {
                "sourceMap": true,
                "declaration": false,
                "declarationMap": false,
                "preserveSymlinks": false
            },
            "inlineStyleFileExtension": "css"
        }
    }, {
        "fileDependencies": {},
        "requiredFilesToEmit": {},
        "requiredFilesToEmitCache": {},
        "fileEmitHistory": {},
        "pluginOptions": {
            "emitClassMetadata": false,
            "emitNgModuleScope": true,
            "jitMode": true,
            "fileReplacements": {},
            "substitutions": {},
            "directTemplateLoading": true,
            "tsconfig": "/Users/jpeck/Data/Programs/ng/hexline/tsconfig.worker.json",
            "compilerOptions": {
                "sourceMap": true,
                "declaration": false,
                "declarationMap": false,
                "preserveSymlinks": false
            },
            "inlineStyleFileExtension": "css"
        }
    }, { "budgets": [] }, {}, {
        "_sortedModulesCache": {},
        "options": {
            "filename": "[name].css",
            "ignoreOrder": false,
            "runtime": true,
            "chunkFilename": "[name].css"
        },
        "runtimeOptions": { "linkType": "text/css" }
    }, {}, {
        "_projectRoot": "/Users/jpeck/Data/Programs/ng/hexline",
        "_analytics": {},
        "_category": "browser",
        "aotEnabled": true,
        "_built": false,
        "_stats": {
            "errors": [],
            "numberOfNgOnInit": 0,
            "numberOfComponents": 0,
            "initialChunkSize": 0,
            "totalChunkCount": 0,
            "totalChunkSize": 0,
            "lazyChunkCount": 0,
            "lazyChunkSize": 0,
            "assetCount": 0,
            "assetSize": 0,
            "polyfillSize": 0,
            "cssSize": 0
        }
    }],
    "node": false
}