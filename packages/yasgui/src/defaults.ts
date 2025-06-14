import { Config } from "./";
import Yasr from "@zazuko/yasr";
import { default as Yasqe } from "@zazuko/yasqe";
import { CatalogueItem } from "./endpointSelect";
import i18next from "i18next";
import i18n from "./i18n.json";

// i18next.init({
//   resources: i18n,
//   lng: "en", // Default language
//   fallbackLng: "en",
//   interpolation: { escapeValue: false },
// });

// i18next.changeLanguage(Yasqe.defaults.interfaceLanguage);

//export default function initialize(): Config<CatalogueItem> {
export default function initialize(config?: Partial<Config<CatalogueItem>>): Config<CatalogueItem> {
  // Use frontend config if provided, otherwise fallback to Yasqe.defaults or "en"
  const language = (config as any)?.interfaceLanguage || Yasqe.defaults.interfaceLanguage || "en";

  i18next.init({
    resources: i18n,
    lng: language,
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });

  return {
    autofocus: true,
    endpointInfo: undefined,
    persistenceId: function (yasgui) {
      //Traverse parents untl we've got an id
      // Get matching parent elements
      var id = "";
      var elem: any = yasgui.rootEl;
      if ((<any>elem).id) id = (<any>elem).id;
      for (; elem && elem !== <any>document; elem = elem.parentNode) {
        if (elem) {
          if ((<any>elem).id) id = (<any>elem).id;
          break;
        }
      }
      return "yagui_" + id;
    },
    tabName: i18next.t("yasgui.query"),
    corsProxy: undefined,
    persistencyExpire: 60 * 60 * 24 * 30,
    persistenceLabelResponse: "response",
    persistenceLabelConfig: "config",
    yasqe: {
      ...Yasqe.defaults,
      ...(config?.yasqe || {}),
    },
    yasr: {
      ...Yasr.defaults,
      ...(config?.yasr || {}),
    },
    endpointCatalogueOptions: {
      getData: () => {
        return [
          {
            endpoint: "https://dbpedia.org/sparql",
          },
          {
            endpoint: "https://query.wikidata.org/bigdata/namespace/wdq/sparql",
          },
        ];
      },
      keys: [],
      renderItem: (data, source) => {
        const contentDiv = document.createElement("div");

        contentDiv.style.display = "flex";
        contentDiv.style.flexDirection = "column";
        const endpointSpan = document.createElement("span");
        endpointSpan.innerHTML =
          data.matches.endpoint?.reduce(
            (current, object) => (object.highlight ? current + object.text.bold() : current + object.text),
            "",
          ) || "";
        contentDiv.appendChild(endpointSpan);
        source.appendChild(contentDiv);
      },
    },
    copyEndpointOnNewTab: true,
    populateFromUrl: true,
    autoAddOnInit: true,
    requestConfig: Yasqe.defaults.requestConfig,
    contextMenuContainer: undefined,
  };
}
