import { mountThemeToggle } from "./lib/chrome.js";
import { $ } from "./lib/dom.js";

const host = $("#theme-host");
if (host) mountThemeToggle(host);
