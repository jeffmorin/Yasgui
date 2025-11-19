import { EventEmitter } from "events";
import { merge, filter, mapValues, uniqueId } from "lodash-es";
import getDefaults from "./defaults";
import { Plugin } from "./plugins";
import {
  Storage as YStorage,
  drawFontAwesomeIconAsSvg,
  drawSvgStringAsElement,
  removeClass,
  addClass,
  hasClass,
} from "@zazuko/yasgui-utils";
import Parser from "./parsers";
export { default as Parser } from "./parsers";
import { addScript, addCss, sanitize } from "./helpers";
import * as faDownload from "@fortawesome/free-solid-svg-icons/faDownload";
import * as faQuestionCircle from "@fortawesome/free-solid-svg-icons/faQuestionCircle";
import i18next from "i18next";
require("./main.scss");

export interface PersistentConfig {
  selectedPlugin?: string;
  pluginsConfig?: { [pluginName: string]: any };
}

export interface Yasr {
  on(event: "change", listener: (instance: Yasr) => void): this;
  emit(event: "change", instance: Yasr): boolean;
  on(event: "draw", listener: (instance: Yasr, plugin: Plugin<any>) => void): this;
  emit(event: "draw", instance: Yasr, plugin: Plugin<any>): boolean;
  on(event: "drawn", listener: (instance: Yasr, plugin: Plugin<any>) => void): this;
  emit(event: "drawn", instance: Yasr, plugin: Plugin<any>): boolean;
  on(event: "toggle-help", listener: (instance: Yasr) => void): this;
  emit(event: "toggle-help", instance: Yasr): boolean;
}
export class Yasr extends EventEmitter {
  public results?: Parser;
  public rootEl: HTMLDivElement;
  public headerEl: HTMLDivElement;
  public fallbackInfoEl: HTMLDivElement;
  public resultsEl: HTMLDivElement;
  public pluginControls!: HTMLDivElement;
  public config: Config;
  public storage: YStorage;
  public plugins: { [name: string]: Plugin<any> } = {};
  // private persistentConfig: PersistentConfig;
  public helpDrawn: Boolean = false;
  private drawnPlugin: string | undefined;
  private selectedPlugin: string | undefined;

  // Utils
  public utils = { addScript: addScript, addCSS: addCss, sanitize: sanitize };

  constructor(parent: HTMLElement, conf: Partial<Config> = {}, data?: any) {
    super();
    if (!parent) throw new Error("No parent passed as argument. Dont know where to draw YASR");
    this.rootEl = document.createElement("div");
    this.rootEl.className = "yasr";
    parent.appendChild(this.rootEl);
    this.config = merge({}, Yasr.defaults, conf);

    //Do some post processing
    this.storage = new YStorage(Yasr.storageNamespace);
    this.getConfigFromStorage();
    this.headerEl = document.createElement("div");
    this.headerEl.className = "yasr_header";
    this.rootEl.appendChild(this.headerEl);
    this.fallbackInfoEl = document.createElement("div");
    this.fallbackInfoEl.className = "yasr_fallback_info";
    this.rootEl.appendChild(this.fallbackInfoEl);
    this.resultsEl = document.createElement("div");
    this.resultsEl.className = "yasr_results";
    this.resultsEl.id = uniqueId("resultsId");
    this.rootEl.appendChild(this.resultsEl);
    this.initializePlugins();
    this.drawHeader();

    const resp = data || this.getResponseFromStorage();
    if (resp) this.setResponse(resp);
  }
  private getConfigFromStorage() {
    const storageId = this.getStorageId(this.config.persistenceLabelConfig);
    if (storageId) {
      const persistentConfig: PersistentConfig | undefined = this.storage.get(storageId);
      if (persistentConfig) {
        this.selectedPlugin = persistentConfig.selectedPlugin;
        for (const pluginName in persistentConfig.pluginsConfig) {
          const pConf = persistentConfig.pluginsConfig[pluginName];
          if (pConf && this.config.plugins[pluginName]) this.config.plugins[pluginName].dynamicConfig = pConf;
        }
      }
    }
  }

  /**
   * Ask the [[ Config.errorRenderers | configured error renderers ]] for a
   * custom rendering of [[`error`]].
   *
   * @param  error the error for which to find a custom rendering
   * @return       the first custom rendering found, or `undefined` if none was found.
   */
  public async renderError(error: Parser.ErrorSummary): Promise<HTMLElement | undefined> {
    // Chain the errorRenderers to get the first special rendering of the error
    // if no special rendering is found, return undefined
    let element: HTMLElement | undefined = undefined;
    if (this.config.errorRenderers !== undefined) {
      for (const renderer of this.config.errorRenderers) {
        element = await renderer(error);
        if (element !== undefined) break; // we found the first special case, so return that!
      }
    }
    return element;
  }

  public getStorageId(label: string, getter?: Config["persistenceId"]): string | undefined {
    const persistenceId = getter || this.config.persistenceId;
    if (!persistenceId) return;
    if (typeof persistenceId === "string") return persistenceId + "_" + label;
    return persistenceId(this) + "_" + label;
  }

  public somethingDrawn() {
    return !!this.resultsEl.children.length;
  }
  /**
   * Empties fallback element
   * CSS will make sure the outline is hidden when empty
   */
  public emptyFallbackElement() {
    // This is quicker than `<node>.innerHtml = ""`
    while (this.fallbackInfoEl.firstChild) this.fallbackInfoEl.removeChild(this.fallbackInfoEl.firstChild);
  }
  public getSelectedPluginName(): string {
    return this.selectedPlugin || this.config.defaultPlugin;
  }
  public getSelectedPlugin() {
    if (this.plugins[this.getSelectedPluginName()]) {
      return this.plugins[this.getSelectedPluginName()];
    }
    console.warn(`Tried using plugin ${this.getSelectedPluginName()}, but seems this plugin isnt registered in yasr.`);
  }
  /**
   * Update selectors, based on whether they can actuall draw something, and which plugin is currently selected
   */
  private updatePluginSelectors(enabledPlugins?: string[]) {
    if (!this.pluginSelectorsEl) return;
    for (const pluginName in this.config.plugins) {
      const plugin = this.plugins[pluginName];
      if (plugin && !plugin.hideFromSelection) {
        if (enabledPlugins) {
          if (enabledPlugins.indexOf(pluginName) >= 0) {
            //make sure enabled
            removeClass(this.pluginSelectorsEl.querySelector(".select_" + pluginName), "disabled");
          } else {
            //make sure disabled
            addClass(this.pluginSelectorsEl.querySelector(".select_" + pluginName), "disabled");
          }
        }
        if (pluginName === this.getSelectedPluginName()) {
          addClass(this.pluginSelectorsEl.querySelector(".select_" + pluginName), "selected");
        } else {
          removeClass(this.pluginSelectorsEl.querySelector(".select_" + pluginName), "selected");
        }
      }
    }
  }

  private getCompatiblePlugins(): string[] {
    if (!this.results)
      return Object.keys(
        filter(this.config.plugins, (val) => (typeof val === "object" && val.enabled) || (val as any) === true),
      );

    const supportedPlugins: { name: string; priority: number }[] = [];
    for (const pluginName in this.plugins) {
      if (this.plugins[pluginName].canHandleResults()) {
        supportedPlugins.push({ name: pluginName, priority: this.plugins[pluginName].priority });
      }
    }
    return supportedPlugins.sort((p1, p2) => p2.priority - p1.priority).map((p) => p.name);
  }
  public draw() {
    this.updateHelpButton();
    this.updateResponseInfo();
    if (!this.results) return;
    const compatiblePlugins = this.getCompatiblePlugins();
    if (this.drawnPlugin && this.getSelectedPluginName() !== this.drawnPlugin) {
      while (this.pluginControls.firstChild) {
        this.pluginControls.firstChild.remove();
      }
      this.plugins[this.drawnPlugin].destroy?.();
    }
    let pluginToDraw: string | undefined;
    if (this.getSelectedPlugin() && this.getSelectedPlugin()?.canHandleResults()) {
      pluginToDraw = this.getSelectedPluginName();
      // When present remove fallback box
      this.emptyFallbackElement();
    } else if (compatiblePlugins[0]) {
      if (this.drawnPlugin) {
        this.plugins[this.drawnPlugin].destroy?.();
      }
      pluginToDraw = compatiblePlugins[0];
      // Signal to create the plugin+
      this.fillFallbackBox(pluginToDraw);
    }
    if (pluginToDraw) {
      this.drawnPlugin = pluginToDraw;

      this.emit("draw", this, this.plugins[pluginToDraw]);
      const plugin = this.plugins[pluginToDraw];
      const initPromise = plugin.initialize ? plugin.initialize() : Promise.resolve();
      initPromise.then(
        async () => {
          if (pluginToDraw) {
            // make sure to clear the object _here_
            // otherwise we run into race conditions when draw is executed
            // shortly after each other, and the plugin uses an initialize function
            // as a result, things can be rendered _twice_
            while (this.resultsEl.firstChild) this.resultsEl.firstChild.remove();
            await this.plugins[pluginToDraw].draw(this.config.plugins[pluginToDraw].dynamicConfig);
            this.emit("drawn", this, this.plugins[pluginToDraw]);
            this.updateExportHeaders();
            this.updatePluginSelectors(compatiblePlugins);
          }
        },
        (_e) => console.error,
      );
    } else {
      this.resultsEl.textContent = "cannot render result";
      this.updateExportHeaders();
      this.updatePluginSelectors(compatiblePlugins);
    }
  }
  //just an alias for `draw`. That way, we've got a consistent api with yasqe
  public refresh() {
    this.draw();
  }
  public destroy() {
    if (this.drawnPlugin) this.plugins[this.drawnPlugin]?.destroy?.();
    this.removeAllListeners();
    this.rootEl.remove();
  }

  getPrefixes(): Prefixes {
    if (this.config.prefixes) {
      if (typeof this.config.prefixes === "function") {
        return this.config.prefixes(this);
      } else {
        return this.config.prefixes;
      }
    }
    return {};
  }
  public selectPlugin(plugin: string) {
    if (this.selectedPlugin === plugin) {
      // Don't re-render when selecting the same plugin. Also see #1893
      return;
    }
    if (this.config.plugins[plugin]) {
      this.selectedPlugin = plugin;
    } else {
      console.warn(`Plugin ${plugin} does not exist.`);
      this.selectedPlugin = this.config.defaultPlugin;
    }
    this.storeConfig();
    this.emit("change", this);
    this.updatePluginSelectors();
    this.draw();
  }
  private pluginSelectorsEl!: HTMLUListElement;
  drawPluginSelectors() {
    this.pluginSelectorsEl = document.createElement("ul");
    this.pluginSelectorsEl.className = "yasr_btnGroup";
    const pluginOrder = this.config.pluginOrder;
    Object.keys(this.config.plugins)
      .sort()
      .forEach((plugin) => {
        if (pluginOrder.indexOf(plugin) === -1) pluginOrder.push(plugin);
      });
    for (const pluginName of pluginOrder) {
      if (!this.config.plugins[pluginName] || !this.config.plugins[pluginName].enabled) {
        continue;
      }
      const plugin = this.plugins[pluginName];

      if (!plugin) continue; //plugin not loaded
      if (plugin.hideFromSelection) continue;
      const name = plugin.label || pluginName;
      const button = document.createElement("button");
      addClass(button, "yasr_btn", "select_" + pluginName);
      button.title = name;
      button.type = "button";
      button.setAttribute("aria-label", `Shows ${name} view`);
      if (plugin.getIcon) {
        const icon = plugin.getIcon();
        if (icon) {
          // icon.className = '';
          addClass(icon, "plugin_icon");
          button.appendChild(icon);
        }
      }
      const nameEl = document.createElement("span");
      nameEl.textContent = name;
      button.appendChild(nameEl);
      button.addEventListener("click", () => this.selectPlugin(pluginName));
      const li = document.createElement("li");
      li.appendChild(button);
      this.pluginSelectorsEl.appendChild(li);
    }

    if (this.pluginSelectorsEl.children.length >= 1) this.headerEl.appendChild(this.pluginSelectorsEl);
    this.updatePluginSelectors();
  }
  private fillFallbackBox(fallbackElement?: string) {
    this.emptyFallbackElement();

    // Do not show fallback render warnings for plugins without a selector.
    if (this.plugins[fallbackElement || this.drawnPlugin || ""]?.hideFromSelection) return;

    const selectedPlugin = this.getSelectedPlugin();
    const fallbackPluginLabel =
      this.plugins[fallbackElement || this.drawnPlugin || ""]?.label || fallbackElement || this.drawnPlugin;
    const selectedPluginLabel = selectedPlugin?.label || this.getSelectedPluginName();

    const textElement = document.createElement("p");
    textElement.innerText = `Could not render results with the ${selectedPluginLabel} plugin, the results currently are rendered with the ${fallbackPluginLabel} plugin. ${
      this.getSelectedPlugin()?.helpReference ? "See " : ""
    }`;

    if (selectedPlugin?.helpReference) {
      const linkElement = document.createElement("a");
      linkElement.innerText = `${selectedPluginLabel} documentation`;
      linkElement.href = selectedPlugin.helpReference;
      linkElement.rel = "noopener noreferrer";
      linkElement.target = "_blank";
      textElement.append(linkElement);
      textElement.innerHTML += " for more information.";
    }

    this.fallbackInfoEl.appendChild(textElement);
  }
  private drawPluginElement() {
    const spaceElement = document.createElement("div");
    addClass(spaceElement, "space_element");
    this.headerEl.appendChild(spaceElement);
    this.pluginControls = document.createElement("div");
    this.pluginControls.setAttribute("id", "yasr_plugin_control");
    addClass(this.pluginControls, "yasr_plugin_control");
    this.pluginControls.setAttribute("aria-controls", this.resultsEl.id);
    this.headerEl.appendChild(this.pluginControls);
  }

  private drawHeader() {
    this.drawPluginSelectors();
    this.drawResponseInfo();
    this.drawPluginElement();
    this.drawDownloadIcon();
    this.drawDocumentationButton();
  }
  private downloadBtn: HTMLAnchorElement | undefined;
  private downloadSelectBtn: HTMLAnchorElement | undefined;
  private selectMenuEl: HTMLDivElement | undefined;
  private selectMenuCloseHandler: ((e: MouseEvent) => void) | undefined;
  private selectMenuContainer: HTMLDivElement | undefined;
  private drawDownloadIcon() {
    // draw a button that requests SELECT results as application/sparql-results+json
    // and triggers a browser download of the response. Placed to the left of
    // the regular download button so users can explicitly download SELECT JSON.
    this.drawSelectDownloadIcon();

    this.downloadBtn = document.createElement("a");
    addClass(this.downloadBtn, "yasr_btn", "yasr_downloadIcon", "btn_icon");
    this.downloadBtn.download = ""; // should default to the file name of the blob
    this.downloadBtn.setAttribute("aria-label", "Download Results");
    this.downloadBtn.setAttribute("tabindex", "0"); // anchor elements with no href are not automatically included in the tabindex
    this.downloadBtn.setAttribute("role", "button");
    const iconEl = drawSvgStringAsElement(drawFontAwesomeIconAsSvg(faDownload));
    iconEl.setAttribute("aria-hidden", "true");
    this.downloadBtn.appendChild(iconEl);
    this.downloadBtn.addEventListener("click", () => {
      if (hasClass(this.downloadBtn, "disabled")) return;
      this.download();
    });
    this.downloadBtn.addEventListener("keydown", (event) => {
      // needed for accessibility
      if (event.code === "Space" || event.code === "Enter") {
        if (hasClass(this.downloadBtn, "disabled")) return;
        this.download();
      }
    });

    // Hide the original download button from the UI — kept in DOM for
    // backwards-compatibility of any code that may reference it.
    this.downloadBtn.style.display = "none";
    this.headerEl.appendChild(this.downloadBtn);
  }

  private drawSelectDownloadIcon() {
    this.downloadSelectBtn = document.createElement("a");
    addClass(this.downloadSelectBtn, "yasr_btn", "yasr_downloadSelectIcon", "btn_icon");
    this.downloadSelectBtn.setAttribute("aria-label", "Download SELECT results (JSON)");
    this.downloadSelectBtn.setAttribute("tabindex", "0");
    this.downloadSelectBtn.setAttribute("role", "button");
    const iconEl = drawSvgStringAsElement(drawFontAwesomeIconAsSvg(faDownload));
    iconEl.setAttribute("aria-hidden", "true");
    this.downloadSelectBtn.appendChild(iconEl);
    this.downloadSelectBtn.addEventListener("click", () => {
      if (hasClass(this.downloadSelectBtn, "disabled")) return;
      this.toggleSelectMenu();
    });
    this.downloadSelectBtn.addEventListener("keydown", (event) => {
      if (event.code === "Space" || event.code === "Enter") {
        if (hasClass(this.downloadSelectBtn, "disabled")) return;
        this.toggleSelectMenu();
      }
    });

    // Insert before the main download button (if it exists), otherwise append
    // to the header so it appears left of the regular download button.
    // Wrap the button in a positioned container so the dropdown can be
    // absolutely positioned relative to the button.
    const container = document.createElement("div");
    container.className = "yasr_select_download_wrapper";
    container.style.position = "relative";
    container.style.display = "inline-block";
    container.appendChild(this.downloadSelectBtn);
    this.headerEl.appendChild(container);
    this.selectMenuContainer = container;
  }

  private toggleSelectMenu() {
    if (this.selectMenuEl) {
      this.hideSelectMenu();
    } else {
      this.showSelectMenu();
    }
  }

  private showSelectMenu() {
    if (!this.downloadSelectBtn) return;
    // create menu element
    const menu = document.createElement("div");
    menu.className = "yasr_select_download_menu";
    menu.style.position = "absolute";
    menu.style.background = "#fff";
    menu.style.border = "1px solid #ccc";
    menu.style.padding = "4px";
    menu.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
    menu.style.zIndex = "9999";
    // create options
    const options: { label: string; accept: string; ext: string }[] = [
      { label: i18next.t("yasr.response.download.json"), accept: "application/sparql-results+json", ext: "json" },
      { label: i18next.t("yasr.response.download.xml"), accept: "application/sparql-results+xml", ext: "xml" },
      { label: i18next.t("yasr.response.download.csv"), accept: "text/csv", ext: "csv" },
      { label: i18next.t("yasr.response.download.tsv"), accept: "text/tab-separated-values", ext: "tsv" },
      { label: i18next.t("yasr.response.download.srt"), accept: "application/sparql-results+thrift", ext: "srt" },
    ];
    options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.className = "yasr_select_download_option";
      btn.type = "button";
      btn.style.display = "block";
      btn.style.width = "100%";
      btn.style.border = "none";
      btn.style.background = "transparent";
      btn.style.textAlign = "left";
      btn.style.padding = "6px 10px";
      btn.style.cursor = "pointer";
      btn.textContent = opt.label;
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        this.hideSelectMenu();
        await this.downloadWithAccept(opt.accept, opt.ext);
      });
      btn.addEventListener("keydown", async (e: KeyboardEvent) => {
        if (e.code === "Enter" || e.code === "Space") {
          e.preventDefault();
          this.hideSelectMenu();
          await this.downloadWithAccept(opt.accept, opt.ext);
        }
      });
      menu.appendChild(btn);
    });

    // position menu inside the container so it's positioned relative to
    // the button. Place it directly under the button using `top:100%`.
    if (this.selectMenuContainer) {
      menu.style.left = "-6em";
      menu.style.top = "100%";
      menu.style.width = "8em";
      this.selectMenuContainer.appendChild(menu);
      this.selectMenuEl = menu;
    } else {
      // Fallback to body positioning if container missing
      const rect = this.downloadSelectBtn!.getBoundingClientRect();
      menu.style.left = rect.left + window.scrollX + "px";
      menu.style.top = rect.bottom + window.scrollY + "px";
      document.body.appendChild(menu);
      this.selectMenuEl = menu;
    }

    // close when clicking outside
    this.selectMenuCloseHandler = (evt: MouseEvent) => {
      if (!this.selectMenuEl) return;
      const target = evt.target as Node;
      if (target && this.selectMenuEl.contains(target)) return;
      if (target && this.downloadSelectBtn && this.downloadSelectBtn.contains(target)) return;
      this.hideSelectMenu();
    };
    document.addEventListener("mousedown", this.selectMenuCloseHandler, true);
  }

  private hideSelectMenu() {
    if (this.selectMenuEl) {
      this.selectMenuEl.remove();
      this.selectMenuEl = undefined;
    }
    if (this.selectMenuCloseHandler) {
      document.removeEventListener("mousedown", this.selectMenuCloseHandler, true);
      this.selectMenuCloseHandler = undefined;
    }
  }

  private async downloadWithAccept(acceptHeader: string, ext: string) {
    const urlGetter = this.config.getPlainQueryLinkToEndpoint;
    if (!urlGetter) return;
    const url = urlGetter();
    if (!url) return;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: acceptHeader,
        },
      });
      if (!response.ok) {
        const txt = await response.text().catch(() => "");
        console.error("Failed to fetch results for download", response.status, txt);
        return;
      }
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const mockLink = document.createElement("a");
      mockLink.href = downloadUrl;
      const baseName = this.config.getDownloadFileName?.() || "results";
      mockLink.download = `${baseName}.${ext}`;
      mockLink.click();
      setTimeout(() => {
        try {
          window.URL.revokeObjectURL(downloadUrl);
        } catch (e) {
          // ignore
        }
      }, 1500);
    } catch (e) {
      console.error("Error downloading results:", e);
    }
  }
  private dataElement!: HTMLDivElement;
  private drawResponseInfo() {
    this.dataElement = document.createElement("div");
    addClass(this.dataElement, "yasr_response_chip");
    this.headerEl.appendChild(this.dataElement);
    this.updateResponseInfo();
  }
  private updateResponseInfo() {
    let innerText = "";
    if (this.results) {
      removeClass(this.dataElement, "empty");
      const bindings = this.results.getBindings();
      if (bindings) {
        // Set amount of results
        innerText += i18next.t("yasr.results.count", { count: bindings.length });
      }
      const responseTime = this.results.getResponseTime();
      if (responseTime) {
        if (!innerText) innerText = i18next.t("yasr.response");
        const time = responseTime / 1000;
        innerText += " " + i18next.t("yasr.results.seconds", { count: time });
      }
    } else {
      addClass(this.dataElement, "empty");
    }
    this.dataElement.innerText = innerText;
  }
  private updateHelpButton() {
    const selectedPlugin = this.getSelectedPlugin();
    if (selectedPlugin?.helpReference) {
      const titleLabel = i18next.t("yasr.plugin.viewDoc", {
        plugin: selectedPlugin.label || this.getSelectedPluginName(),
      });
      this.documentationLink.href = selectedPlugin.helpReference;
      this.documentationLink.title = titleLabel;
      this.documentationLink.setAttribute("aria-label", titleLabel);
      removeClass(this.documentationLink, "disabled");
    } else {
      addClass(this.documentationLink, "disabled");
      this.documentationLink.title = i18next.t("yasr.plugin.noDoc");
    }
  }
  updateExportHeaders() {
    if (this.downloadBtn && this.drawnPlugin) {
      this.downloadBtn.title = "";
      const plugin = this.plugins[this.drawnPlugin];
      if (plugin && plugin.download) {
        const downloadInfo = plugin.download(this.config.getDownloadFileName?.());
        removeClass(this.downloadBtn, "disabled");
        if (downloadInfo) {
          if (downloadInfo.title) this.downloadBtn.title = downloadInfo.title;
          return;
        }
      }
      this.downloadBtn.title = i18next.t("yasr.download.notSupported");
      addClass(this.downloadBtn, "disabled");
    }
    // Enable/disable the SELECT->JSON download button depending on whether
    // a plain GET link to the current query is available.
    if (this.downloadSelectBtn) {
      try {
        const urlGetter = this.config.getPlainQueryLinkToEndpoint;
        const hasLink = typeof urlGetter === "function" && !!urlGetter();
        if (hasLink) {
          removeClass(this.downloadSelectBtn, "disabled");
          this.downloadSelectBtn.title = i18next.t("yasr.response.download");
        } else {
          addClass(this.downloadSelectBtn, "disabled");
          this.downloadSelectBtn.title = i18next.t("yasr.download.notSupported") || "Download not available";
        }
      } catch (e) {
        addClass(this.downloadSelectBtn, "disabled");
      }
    }
  }

  private documentationLink!: HTMLAnchorElement;
  private drawDocumentationButton() {
    this.documentationLink = document.createElement("a");
    addClass(this.documentationLink, "yasr_btn", "yasr_external_ref_btn");
    this.documentationLink.appendChild(drawSvgStringAsElement(drawFontAwesomeIconAsSvg(faQuestionCircle)));
    this.documentationLink.href = "//docs.triply.cc/yasgui/";
    this.documentationLink.target = "_blank";
    this.documentationLink.rel = "noopener noreferrer";
    this.documentationLink.id = "yasr_help_button";
    this.headerEl.appendChild(this.documentationLink); // We can do this as long as the help-element is the last item in the row
  }
  download() {
    if (!this.drawnPlugin) return;
    const currentPlugin = this.plugins[this.drawnPlugin];
    if (currentPlugin && currentPlugin.download) {
      const downloadInfo = currentPlugin.download(this.config.getDownloadFileName?.());
      if (!downloadInfo) return;
      const data = downloadInfo.getData();
      let downloadUrl: string;
      if (data.startsWith("data:")) {
        downloadUrl = data;
      } else {
        const blob = new Blob([data], { type: downloadInfo.contentType ?? "text/plain" });
        downloadUrl = window.URL.createObjectURL(blob);
      }
      const mockLink = document.createElement("a");
      mockLink.href = downloadUrl;
      mockLink.download = downloadInfo.filename;
      mockLink.click();
    }
  }

  public handleLocalStorageQuotaFull(_e: any) {
    console.warn("Localstorage quota exceeded. Clearing all queries");
    Yasr.clearStorage();
  }

  public getResponseFromStorage() {
    const storageId = this.getStorageId(this.config.persistenceLabelResponse);
    if (storageId) {
      return this.storage.get(storageId);
    }
  }
  public getPersistentConfig(): PersistentConfig {
    return {
      selectedPlugin: this.getSelectedPluginName(),
      pluginsConfig: mapValues(this.config.plugins, (plugin) => plugin.dynamicConfig),
    };
  }
  //This doesnt store the plugin complete config. Only those configs we want persisted
  public storePluginConfig(pluginName: string, conf: any) {
    this.config.plugins[pluginName].dynamicConfig = conf;
    this.storeConfig();
    this.emit("change", this);
  }
  private storeConfig() {
    const storageId = this.getStorageId(this.config.persistenceLabelConfig);
    if (storageId) {
      this.storage.set(
        storageId,
        this.getPersistentConfig(),
        this.config.persistencyExpire,
        this.handleLocalStorageQuotaFull,
      );
    }
  }
  private storeResponse() {
    const storageId = this.getStorageId(this.config.persistenceLabelResponse);
    if (storageId && this.results) {
      const storeObj = this.results.getAsStoreObject(this.config.maxPersistentResponseSize);
      if (storeObj && !storeObj.error) {
        this.storage.set(storageId, storeObj, this.config.persistencyExpire, this.handleLocalStorageQuotaFull);
      } else {
        //remove old string;
        this.storage.remove(storageId);
      }
    }
  }
  public setResponse(data: any, duration?: number) {
    if (!data) return;
    this.results = new Parser(data, duration);

    this.draw();

    this.storeResponse();
  }

  private initializePlugins() {
    for (const plugin in this.config.plugins) {
      if (!this.config.plugins[plugin]) continue; //falsy value, so assuming it should be disabled
      if (Yasr.plugins[plugin]) {
        this.plugins[plugin] = new (<any>Yasr.plugins[plugin])(this);
      } else {
        console.warn(`Wanted to initialize plugin ${plugin} but could not find a matching registered plugin`);
      }
    }
  }

  static defaults: Config = getDefaults();
  static plugins: { [key: string]: typeof Plugin & { defaults?: any } } = {};
  static registerPlugin(name: string, plugin: typeof Plugin, enable = true) {
    Yasr.plugins[name] = plugin;
    if (enable) {
      Yasr.defaults.plugins[name] = { enabled: true };
    } else {
      Yasr.defaults.plugins[name] = { enabled: false };
    }
  }
  /**
   * Collection of Promises to load external scripts used by Yasr Plugins
   * That way, the plugins wont load similar scripts simultaneously
   */
  static Dependencies: { [name: string]: Promise<any> } = {};
  static storageNamespace = "triply";
  static clearStorage() {
    const storage = new YStorage(Yasr.storageNamespace);
    storage.removeNamespace();
  }
}

export type Prefixes = { [prefixLabel: string]: string };
export interface PluginConfig {
  dynamicConfig?: any;
  staticConfig?: any;
  enabled?: boolean;
}
export interface Config {
  persistenceId: ((yasr: Yasr) => string) | string | null;
  persistenceLabelResponse: string;
  persistenceLabelConfig: string;
  maxPersistentResponseSize: number;
  persistencyExpire: number;
  getPlainQueryLinkToEndpoint: (() => string | undefined) | undefined;
  getDownloadFileName?: () => string | undefined;
  plugins: { [pluginName: string]: PluginConfig };
  pluginOrder: string[];
  defaultPlugin: string;

  prefixes: Prefixes | ((yasr: Yasr) => Prefixes);

  /**
   * Custom renderers for errors.
   * Allow multiple to be able to add new custom renderers without having to
   * overwrite or explicitly call previously added or default ones.
   */
  errorRenderers?: ((error: Parser.ErrorSummary) => Promise<HTMLElement | undefined>)[];
}

export function registerPlugin(name: string, plugin: typeof Plugin, enable = true) {
  Yasr.plugins[name] = plugin;
  if (enable) {
    Yasr.defaults.plugins[name] = { enabled: true };
  } else {
    Yasr.defaults.plugins[name] = { enabled: false };
  }
}

import * as YasrPluginTable from "./plugins/table";
import * as YasrPluginBoolean from "./plugins/boolean";
import * as YasrPluginResponse from "./plugins/response";
import * as YasrPluginError from "./plugins/error";

Yasr.registerPlugin("table", YasrPluginTable.default as any);
Yasr.registerPlugin("boolean", YasrPluginBoolean.default as any);
Yasr.registerPlugin("response", YasrPluginResponse.default as any);
Yasr.registerPlugin("error", YasrPluginError.default as any);

export { Plugin, DownloadInfo } from "./plugins";

export default Yasr;
