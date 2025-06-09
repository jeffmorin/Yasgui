"use strict";
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, "default", { enumerable: true, value: v });
      }
    : function (o, v) {
        o["default"] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
      __setModuleDefault(result, mod);
      return result;
    };
  })();
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.genericConfig = exports.htmlConfigs = exports.indexPage = exports.analyzeBundle = void 0;
exports.getLinks = getLinks;
const LiveReloadPlugin = require("webpack-livereload-plugin");
const html_webpack_plugin_1 = __importDefault(require("html-webpack-plugin"));
const webpack = __importStar(require("webpack"));
const path = __importStar(require("path"));
const isProd = process.env.NODE_ENV === "production";
const isDev = !isProd;
const bgImage = require("postcss-bgimage");
const autoprefixer_1 = __importDefault(require("autoprefixer"));
const mini_css_extract_plugin_1 = __importDefault(require("mini-css-extract-plugin"));
var TerserPlugin = require("terser-webpack-plugin");
const css_minimizer_webpack_plugin_1 = __importDefault(require("css-minimizer-webpack-plugin"));
const copy_webpack_plugin_1 = __importDefault(require("copy-webpack-plugin"));
const webpack_bundle_analyzer_1 = require("webpack-bundle-analyzer");
exports.analyzeBundle = process.env["ANALYZE_BUNDLE"] === "true";
const plugins = [
  new webpack.DefinePlugin({
    __DEVELOPMENT__: isDev,
  }),
];
const defaultEndpoint = "https://dbpedia.org/sparql";
const corsProxy = "";
function getAliasFor(packageName) {
  const fullPackageName = packageName === "utils" ? "@zazuko/yasgui-utils" : `@zazuko/${packageName}`;
  const packagePath = path.resolve(__dirname, "../packages", packageName, "src");
  return {
    [`${fullPackageName}$`]: path.resolve(packagePath, "index.ts"),
  };
}
exports.indexPage = {
  filename: "index.html",
  template: path.resolve(__dirname, "pages/index.html"),
  templateParameters: {
    links: [
      { href: "yasgui.html", text: "Yasgui" },
      { href: "yasqe.html", text: "Yasqe" },
      { href: "yasr.html", text: "Yasr" },
    ],
  },
  inject: false,
};
function getLinks(active) {
  return [
    { href: "yasgui.html", text: "Yasgui", className: active === "Yasgui" && "active" },
    { href: "yasqe.html", text: "Yasqe", className: active === "Yasqe" && "active" },
    { href: "yasr.html", text: "Yasr", className: active === "Yasr" && "active" },
  ];
}
exports.htmlConfigs = {
  index: {
    filename: "index.html",
    template: path.resolve(__dirname, "pages/index.html"),
    templateParameters: {
      links: getLinks(),
      endpoint: defaultEndpoint,
    },
    inject: false,
  },
  yasgui: {
    filename: "yasgui.html",
    template: path.resolve(__dirname, "pages/yasgui.html"),
    templateParameters: {
      links: getLinks("Yasgui"),
      endpoint: defaultEndpoint,
      corsProxy: corsProxy,
    },
    chunks: ["Yasqe", "Yasr", "Yasgui"],
  },
  yasqe: {
    filename: "yasqe.html",
    template: path.resolve(__dirname, "pages/yasqe.html"),
    templateParameters: {
      links: getLinks("Yasqe"),
      endpoint: defaultEndpoint,
    },
    chunks: ["Yasqe"],
  },
  yasr: {
    filename: "yasr.html",
    template: path.resolve(__dirname, "pages/yasr.html"),
    templateParameters: {
      links: getLinks("Yasr"),
      endpoint: defaultEndpoint,
    },
    chunks: ["Yasqe", "Yasr"],
  },
};
plugins.push(...Object.values(exports.htmlConfigs).map((c) => new html_webpack_plugin_1.default(c)));
if (isDev) {
  plugins.push(new webpack.WatchIgnorePlugin({ paths: [/\.js$/, /\.d\.ts$/] }));
  plugins.push(new LiveReloadPlugin({ port: 35731 }));
  plugins.push(new webpack.HotModuleReplacementPlugin());
} else {
  plugins.push(
    new mini_css_extract_plugin_1.default({
      filename: (pathData) => {
        var _a;
        const name = `${(_a = pathData.chunk) === null || _a === void 0 ? void 0 : _a.name}`.toLocaleLowerCase();
        return `${name}.min.css`;
      },
    }),
  );
}
if (exports.analyzeBundle) plugins.push(new webpack_bundle_analyzer_1.BundleAnalyzerPlugin());
plugins.push(
  new copy_webpack_plugin_1.default({
    patterns: [
      { from: "webpack/yasgui.png", to: "webpack/" },
      { from: "packages/yasgui/static/", to: "packages/yasgui/static/" },
    ],
    options: {
      concurrency: 100,
    },
  }),
);
exports.genericConfig = {
  devtool: isDev ? "inline-source-map" : "source-map",
  cache: isDev,
  optimization: {
    minimize: true,
    minimizer: isDev
      ? []
      : [
          new TerserPlugin({
            // Documentation: https://github.com/webpack-contrib/terser-webpack-plugin
            // options has an unknown property 'sourceMap'. These properties are valid:
            // object { test?, include?, exclude?, terserOptions?, extractComments?, parallel?, minify? }
            // sourceMap: true,
          }),
          new css_minimizer_webpack_plugin_1.default({}),
        ],
  },
  performance: {
    maxEntrypointSize: 3000000,
    maxAssetSize: 3000000,
  },
  mode: isDev ? "development" : "production",
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: "babel-loader",
            options: {
              presets: [
                [
                  "@babel/preset-env",
                  {
                    targets: ["last 3 versions", "> 1%"],
                  },
                ],
              ],
              plugins: ["@babel/plugin-transform-runtime"],
            },
          },
          {
            loader: "ts-loader",
            options: {
              configFile: `tsconfig-build.json`,
            },
          },
        ],
      },
      {
        test: /\.js$/,
        include: [/query-string/, /strict-uri-encode/, /n3/, /split-on-first/],
        use: [
          {
            loader: "babel-loader",
            options: {
              presets: [
                [
                  "@babel/preset-env",
                  {
                    targets: ["last 3 versions", "> 1%"],
                  },
                ],
              ],
            },
          },
        ],
      },
      {
        test: /\.scss$/,
        use: [
          isDev ? "style-loader" : mini_css_extract_plugin_1.default.loader,
          { loader: "css-loader", options: { importLoaders: 2 } },
          {
            loader: "postcss-loader",
            options: { postcssOptions: { plugins: [(0, autoprefixer_1.default)()] } },
          },
          "sass-loader",
        ],
      },
      {
        test: /\.js$/,
        exclude: [/node_modules\/column-resizer/g, /\/rdf-string\//g],
        use: ["source-map-loader"],
        enforce: "pre",
      },
      {
        test: /\.css$/,
        use: [
          isDev ? "style-loader" : mini_css_extract_plugin_1.default.loader,
          { loader: "css-loader", options: { importLoaders: 1 } },
          {
            loader: "postcss-loader",
            options: { postcssOptions: { plugins: () => [bgImage({ mode: "cutter" })] } },
          },
        ],
      },
    ],
  },
  resolve: {
    modules: [
      path.resolve(__dirname, "./../node_modules"),
      path.resolve(__dirname, "./../packages/yasgui/node_modules"),
      path.resolve(__dirname, "./../packages/yasqe/node_modules"),
      path.resolve(__dirname, "./../packages/yasr/node_modules"),
      path.resolve(__dirname, "./../packages/utils/node_modules"),
    ],
    alias: Object.assign(
      Object.assign(Object.assign(Object.assign({}, getAliasFor("yasgui")), getAliasFor("yasr")), getAliasFor("yasqe")),
      getAliasFor("utils"),
    ),
    extensions: [".json", ".js", ".ts", ".scss"],
  },
  plugins: plugins,
};
const config = Object.assign(Object.assign({}, exports.genericConfig), {
  stats: {
    errorDetails: true,
    children: true,
  },
  output: {
    path: path.resolve("build"),
    publicPath: "/",
    filename: function (chunkData) {
      const ext = `${isDev ? "" : ".min"}.js`;
      return `${chunkData.chunk.name.toLowerCase()}${ext}`;
    },
    library: "[name]",
    libraryExport: "default",
    libraryTarget: "umd",
    umdNamedDefine: true,
  },
  entry: {
    Yasgui: [path.resolve(__dirname, "./../packages/yasgui/src/index.ts")],
    Yasqe: path.resolve(__dirname, "./../packages/yasqe/src/index.ts"),
    Yasr: path.resolve(__dirname, "./../packages/yasr/src/index.ts"),
    Utils: path.resolve(__dirname, "./../packages/utils/src/index.ts"),
  },
});
exports.default = config;
//# sourceMappingURL=config.js.map
