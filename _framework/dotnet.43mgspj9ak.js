//! Licensed to the .NET Foundation under one or more agreements.
//! The .NET Foundation licenses this file to you under the MIT license.

const e=async()=>WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,2,1,0,10,8,1,6,0,6,64,25,11,11])),o=async()=>WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,15,1,13,0,65,1,253,15,65,2,253,15,253,128,2,11])),t=async()=>WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11])),n=Symbol.for("wasm promise_control");function r(e,o){let t=null;const r=new Promise(function(n,r){t={isDone:!1,promise:null,resolve:o=>{t.isDone||(t.isDone=!0,n(o),e&&e())},reject:e=>{t.isDone||(t.isDone=!0,r(e),o&&o())}}});t.promise=r;const s=r;return s[n]=t,{promise:s,promise_control:t}}function s(e){return e[n]}function i(e){e&&function(e){return void 0!==e[n]}(e)||We(!1,"Promise is not controllable")}const a="__mono_message__",l=["debug","log","trace","warn","info","error"],c="MONO_WASM: ";let d,u,f,m,g,p;function h(e){m=e}function b(e){if(Se.diagnosticTracing){const o="function"==typeof e?e():e;console.debug(c+o)}}function w(e,...o){console.info(c+e,...o)}function y(e,...o){console.info(e,...o)}function v(e,...o){console.warn(c+e,...o)}function _(e,...o){if(o&&o.length>0&&o[0]&&"object"==typeof o[0]){if(o[0].silent)return;if(o[0].toString)return void console.error(c+e,o[0].toString())}console.error(c+e,...o)}function j(e,o,t){return function(...n){try{let r=n[0];if(void 0===r)r="undefined";else if(null===r)r="null";else if("function"==typeof r)r=r.toString();else if("string"!=typeof r)try{r=JSON.stringify(r)}catch(e){r=r.toString()}o(t?JSON.stringify({method:e,payload:r,arguments:n.slice(1)}):[e+r,...n.slice(1)])}catch(e){f.error(`proxyConsole failed: ${e}`)}}}function x(e,o,t){u=o,m=e,f={...o};const n=`${t}/console`.replace("https://","wss://").replace("http://","ws://");d=new WebSocket(n),d.addEventListener("error",E),d.addEventListener("close",A),function(){for(const e of l)u[e]=j(`console.${e}`,T,!0)}()}function R(e){let o=30;const t=()=>{d?0==d.bufferedAmount||0==o?(e&&y(e),function(){for(const e of l)u[e]=j(`console.${e}`,f.log,!1)}(),d.removeEventListener("error",E),d.removeEventListener("close",A),d.close(1e3,e),d=void 0):(o--,globalThis.setTimeout(t,100)):e&&f&&f.log(e)};t()}function T(e){d&&d.readyState===WebSocket.OPEN?d.send(e):f.log(e)}function E(e){f.error(`[${m}] proxy console websocket error: ${e}`,e)}function A(e){f.debug(`[${m}] proxy console websocket closed: ${e}`,e)}function D(){Se.preferredIcuAsset=k(Se.config);let e="invariant"==Se.config.globalizationMode;if(!e)if(Se.preferredIcuAsset)Se.diagnosticTracing&&b("ICU data archive(s) available, disabling invariant mode");else{if("custom"===Se.config.globalizationMode||"all"===Se.config.globalizationMode||"sharded"===Se.config.globalizationMode){const e="invariant globalization mode is inactive and no ICU data archives are available";throw _(`ERROR: ${e}`),new Error(e)}Se.diagnosticTracing&&b("ICU data archive(s) not available, using invariant globalization mode"),e=!0,Se.preferredIcuAsset=null}const o="DOTNET_SYSTEM_GLOBALIZATION_INVARIANT",t=Se.config.environmentVariables;if(void 0===t[o]&&e&&(t[o]="1"),void 0===t.TZ)try{const e=Intl.DateTimeFormat().resolvedOptions().timeZone||null;e&&(t.TZ=e)}catch(e){w("failed to detect timezone, will fallback to UTC")}}function k(e){var o;if((null===(o=e.resources)||void 0===o?void 0:o.icu)&&"invariant"!=e.globalizationMode){const o=e.applicationCulture||(ke?globalThis.navigator&&globalThis.navigator.languages&&globalThis.navigator.languages[0]:Intl.DateTimeFormat().resolvedOptions().locale);e.applicationCulture||(e.applicationCulture=o);const t=e.resources.icu;let n=null;if("custom"===e.globalizationMode){if(t.length>=1)return t[0].name}else o&&"all"!==e.globalizationMode?"sharded"===e.globalizationMode&&(n=function(e){const o=e.split("-")[0];return"en"===o||["fr","fr-FR","it","it-IT","de","de-DE","es","es-ES"].includes(e)?"icudt_EFIGS.dat":["zh","ko","ja"].includes(o)?"icudt_CJK.dat":"icudt_no_CJK.dat"}(o)):n="icudt.dat";if(n)for(let e=0;e<t.length;e++){const o=t[e];if(o.virtualPath===n)return o.name}}return e.globalizationMode="invariant",null}(new Date).valueOf();const C=class{constructor(e){this.url=e}toString(){return this.url}};async function M(e,o){try{const t="function"==typeof globalThis.fetch;if(Te){const n=e.startsWith("file://");if(!n&&t)return globalThis.fetch(e,o||{credentials:"same-origin"});g||(p=await import(/*! webpackIgnore: true */"url"),g=await import(/*! webpackIgnore: true */"fs")),n&&(e=p.fileURLToPath(e));const r=await g.promises.readFile(e);return{ok:!0,headers:{length:0,get:()=>null},url:e,arrayBuffer:()=>r,json:()=>JSON.parse(r),text:()=>{throw new Error("NotImplementedException")}}}if(t)return globalThis.fetch(e,o||{credentials:"same-origin"});if("function"==typeof read)return{ok:!0,url:e,headers:{length:0,get:()=>null},arrayBuffer:()=>new Uint8Array(read(e,"binary")),json:()=>JSON.parse(read(e,"utf8")),text:()=>read(e,"utf8")}}catch(o){return{ok:!1,url:e,status:500,headers:{length:0,get:()=>null},statusText:"ERR28: "+o,arrayBuffer:()=>{throw o},json:()=>{throw o},text:()=>{throw o}}}throw new Error("No fetch implementation available")}const P=/^[a-zA-Z][a-zA-Z\d+\-.]*?:\/\//,S=/[a-zA-Z]:[\\/]/;function U(e){return Te||Ce?e.startsWith("/")||e.startsWith("\\")||-1!==e.indexOf("///")||S.test(e):P.test(e)}let I,O=0;const $=[],N=[],L=new Map,z={"js-module-threads":!0,"js-module-runtime":!0,"js-module-dotnet":!0,"js-module-native":!0,"js-module-diagnostics":!0},W={...z,"js-module-library-initializer":!0},F={...z,dotnetwasm:!0,heap:!0,manifest:!0},V={...W,manifest:!0},B={...W,dotnetwasm:!0},H={dotnetwasm:!0,symbols:!0},J={...W,dotnetwasm:!0,symbols:!0},q={symbols:!0};function Q(e){return!("icu"==e.behavior&&e.name!=Se.preferredIcuAsset)}function Z(e,o,t){null!=o||(o=[]),We(1==o.length,`Expect to have one ${t} asset in resources`);const n=o[0];return n.behavior=t,G(n),e.push(n),n}function G(e){F[e.behavior]&&L.set(e.behavior,e)}function K(e){We(F[e],`Unknown single asset behavior ${e}`);const o=L.get(e);if(o&&!o.resolvedUrl)if(o.resolvedUrl=Se.locateFile(o.name),z[o.behavior]){const e=fe(o);e?("string"!=typeof e&&We(!1,"loadBootResource response for 'dotnetjs' type should be a URL string"),o.resolvedUrl=e):o.resolvedUrl=ae(o.resolvedUrl,o.behavior)}else if("dotnetwasm"!==o.behavior)throw new Error(`Unknown single asset behavior ${e}`);return o}function X(e){const o=K(e);return We(o,`Single asset for ${e} not found`),o}let Y=!1;async function ee(){if(!Y){Y=!0,Se.diagnosticTracing&&b("mono_download_assets");try{const e=[],o=[],t=(e,o)=>{!J[e.behavior]&&Q(e)&&Se.expected_instantiated_assets_count++,!B[e.behavior]&&Q(e)&&(Se.expected_downloaded_assets_count++,o.push(re(e)))};for(const o of $)t(o,e);for(const e of N)t(e,o);Se.allDownloadsQueued.promise_control.resolve(),Promise.all([...e,...o]).then(()=>{Se.allDownloadsFinished.promise_control.resolve()}).catch(e=>{throw Se.err("Error in mono_download_assets: "+e),Ge(1,e),e}),await Se.runtimeModuleLoaded.promise;const n=async e=>{const o=await e;if(o.buffer){if(!J[o.behavior]){o.buffer&&"object"==typeof o.buffer||We(!1,"asset buffer must be array-like or buffer-like or promise of these"),"string"!=typeof o.resolvedUrl&&We(!1,"resolvedUrl must be string");const e=o.resolvedUrl,t=await o.buffer,n=new Uint8Array(t);me(o),await Pe.beforeOnRuntimeInitialized.promise,await Pe.afterInstantiateWasm.promise,Pe.instantiate_asset(o,e,n)}}else H[o.behavior]?("symbols"===o.behavior&&(await Pe.instantiate_symbols_asset(o),me(o)),H[o.behavior]&&++Se.actual_downloaded_assets_count):(o.isOptional||We(!1,"Expected asset to have the downloaded buffer"),!B[o.behavior]&&Q(o)&&Se.expected_downloaded_assets_count--,!J[o.behavior]&&Q(o)&&Se.expected_instantiated_assets_count--)},r=[],s=[];for(const o of e)r.push(n(o));for(const e of o)s.push(n(e));Promise.all(r).then(()=>{De||Pe.coreAssetsInMemory.promise_control.resolve()}).catch(e=>{throw Se.err("Error in mono_download_assets: "+e),Ge(1,e),e}),Promise.all(s).then(async()=>{De||(await Pe.coreAssetsInMemory.promise,Pe.allAssetsInMemory.promise_control.resolve())}).catch(e=>{throw Se.err("Error in mono_download_assets: "+e),Ge(1,e),e})}catch(e){throw Se.err("Error in mono_download_assets: "+e),e}}}let oe=!1;function te(){if(oe)return;oe=!0;const e=Se.config,o=[];if(e.assets)for(const o of e.assets)"object"!=typeof o&&We(!1,`asset must be object, it was ${typeof o} : ${o}`),"string"!=typeof o.behavior&&We(!1,"asset behavior must be known string"),"string"!=typeof o.name&&We(!1,"asset name must be string"),o.resolvedUrl&&"string"!=typeof o.resolvedUrl&&We(!1,"asset resolvedUrl could be string"),o.hash&&"string"!=typeof o.hash&&We(!1,"asset resolvedUrl could be string"),o.pendingDownload&&"object"!=typeof o.pendingDownload&&We(!1,"asset pendingDownload could be object"),o.isCore?$.push(o):N.push(o),G(o);else if(e.resources){const t=e.resources;t.wasmNative||We(!1,"resources.wasmNative must be defined"),t.jsModuleNative||We(!1,"resources.jsModuleNative must be defined"),t.jsModuleRuntime||We(!1,"resources.jsModuleRuntime must be defined"),Z(N,t.wasmNative,"dotnetwasm"),Z(o,t.jsModuleNative,"js-module-native"),Z(o,t.jsModuleRuntime,"js-module-runtime"),t.jsModuleDiagnostics&&Z(o,t.jsModuleDiagnostics,"js-module-diagnostics");const n=(e,o,t)=>{const n=e;n.behavior=o,t?(n.isCore=!0,$.push(n)):N.push(n)};if(t.coreAssembly)for(let e=0;e<t.coreAssembly.length;e++)n(t.coreAssembly[e],"assembly",!0);if(t.assembly)for(let e=0;e<t.assembly.length;e++)n(t.assembly[e],"assembly",!t.coreAssembly);if(0!=e.debugLevel&&Se.isDebuggingSupported()){if(t.corePdb)for(let e=0;e<t.corePdb.length;e++)n(t.corePdb[e],"pdb",!0);if(t.pdb)for(let e=0;e<t.pdb.length;e++)n(t.pdb[e],"pdb",!t.corePdb)}if(e.loadAllSatelliteResources&&t.satelliteResources)for(const e in t.satelliteResources)for(let o=0;o<t.satelliteResources[e].length;o++){const r=t.satelliteResources[e][o];r.culture=e,n(r,"resource",!t.coreAssembly)}if(t.coreVfs)for(let e=0;e<t.coreVfs.length;e++)n(t.coreVfs[e],"vfs",!0);if(t.vfs)for(let e=0;e<t.vfs.length;e++)n(t.vfs[e],"vfs",!t.coreVfs);const r=k(e);if(r&&t.icu)for(let e=0;e<t.icu.length;e++){const o=t.icu[e];o.name===r&&n(o,"icu",!1)}if(t.wasmSymbols)for(let e=0;e<t.wasmSymbols.length;e++)n(t.wasmSymbols[e],"symbols",!1)}if(e.appsettings)for(let o=0;o<e.appsettings.length;o++){const t=e.appsettings[o],n=ge(t);"appsettings.json"!==n&&n!==`appsettings.${e.applicationEnvironment}.json`||N.push({name:t,behavior:"vfs",cache:"no-cache",useCredentials:!0})}e.assets=[...$,...N,...o]}async function ne(e){const o=await re(e);return await o.pendingDownloadInternal.response,o.buffer}async function re(e){try{return await se(e)}catch(o){if(!Se.enableDownloadRetry)throw o;if(Ce||Te)throw o;if(e.pendingDownload&&e.pendingDownloadInternal==e.pendingDownload)throw o;if(e.resolvedUrl&&-1!=e.resolvedUrl.indexOf("file://"))throw o;if(o&&404==o.status)throw o;e.pendingDownloadInternal=void 0,await Se.allDownloadsQueued.promise;try{return Se.diagnosticTracing&&b(`Retrying download '${e.name}'`),await se(e)}catch(o){return e.pendingDownloadInternal=void 0,await new Promise(e=>globalThis.setTimeout(e,100)),Se.diagnosticTracing&&b(`Retrying download (2) '${e.name}' after delay`),await se(e)}}}async function se(e){for(;I;)await I.promise;try{++O,O==Se.maxParallelDownloads&&(Se.diagnosticTracing&&b("Throttling further parallel downloads"),I=r());const o=await async function(e){if(e.pendingDownload&&(e.pendingDownloadInternal=e.pendingDownload),e.pendingDownloadInternal&&e.pendingDownloadInternal.response)return e.pendingDownloadInternal.response;if(e.buffer){const o=await e.buffer;return e.resolvedUrl||(e.resolvedUrl="undefined://"+e.name),e.pendingDownloadInternal={url:e.resolvedUrl,name:e.name,response:Promise.resolve({ok:!0,arrayBuffer:()=>o,json:()=>JSON.parse(new TextDecoder("utf-8").decode(o)),text:()=>{throw new Error("NotImplementedException")},headers:{get:()=>{}}})},e.pendingDownloadInternal.response}const o=e.loadRemote&&Se.config.remoteSources?Se.config.remoteSources:[""];let t;for(let n of o){n=n.trim(),"./"===n&&(n="");const o=ie(e,n);e.name===o?Se.diagnosticTracing&&b(`Attempting to download '${o}'`):Se.diagnosticTracing&&b(`Attempting to download '${o}' for ${e.name}`);try{e.resolvedUrl=o;const n=de(e);if(e.pendingDownloadInternal=n,t=await n.response,!t||!t.ok)continue;return t}catch(e){t||(t={ok:!1,url:o,status:0,statusText:""+e});continue}}const n=e.isOptional||e.name.match(/\.pdb$/)&&Se.config.ignorePdbLoadErrors;if(t||We(!1,`Response undefined ${e.name}`),!n){const o=new Error(`download '${t.url}' for ${e.name} failed ${t.status} ${t.statusText}`);throw o.status=t.status,o}w(`optional download '${t.url}' for ${e.name} failed ${t.status} ${t.statusText}`)}(e);return o?(H[e.behavior]||(e.buffer=await o.arrayBuffer(),++Se.actual_downloaded_assets_count),e):e}finally{if(--O,I&&O==Se.maxParallelDownloads-1){Se.diagnosticTracing&&b("Resuming more parallel downloads");const e=I;I=void 0,e.promise_control.resolve()}}}function ie(e,o){let t;return null==o&&We(!1,`sourcePrefix must be provided for ${e.name}`),e.resolvedUrl?t=e.resolvedUrl:(t=""===o?"assembly"===e.behavior||"pdb"===e.behavior?e.name:"resource"===e.behavior&&e.culture&&""!==e.culture?`${e.culture}/${e.name}`:e.name:o+e.name,t=ae(Se.locateFile(t),e.behavior)),t&&"string"==typeof t||We(!1,"attemptUrl need to be path or url string"),t}function ae(e,o){return Se.modulesUniqueQuery&&V[o]&&(e+=Se.modulesUniqueQuery),e}let le=0;const ce=new Set;function de(e){try{e.resolvedUrl||We(!1,"Request's resolvedUrl must be set");const o=function(e){let o=e.resolvedUrl;if(Se.loadBootResource){const t=fe(e);if(t instanceof Promise)return t;"string"==typeof t&&(o=t)}const t={};return e.cache?t.cache=e.cache:Se.config.disableNoCacheFetch||(t.cache="no-cache"),e.useCredentials?t.credentials="include":!Se.config.disableIntegrityCheck&&e.hash&&(t.integrity=e.hash),Se.fetch_like(o,t)}(e),t={name:e.name,url:e.resolvedUrl,response:o};return ce.add(e.name),t.response.then(()=>{"assembly"==e.behavior&&Se.loadedAssemblies.push(e.name),le++,Se.onDownloadResourceProgress&&Se.onDownloadResourceProgress(le,ce.size)}),t}catch(o){const t={ok:!1,url:e.resolvedUrl,status:500,statusText:"ERR29: "+o,arrayBuffer:()=>{throw o},json:()=>{throw o}};return{name:e.name,url:e.resolvedUrl,response:Promise.resolve(t)}}}const ue={resource:"assembly",assembly:"assembly",pdb:"pdb",icu:"globalization",vfs:"configuration",manifest:"manifest",dotnetwasm:"dotnetwasm","js-module-dotnet":"dotnetjs","js-module-native":"dotnetjs","js-module-runtime":"dotnetjs","js-module-threads":"dotnetjs"};function fe(e){var o;if(Se.loadBootResource){const t=null!==(o=e.hash)&&void 0!==o?o:"",n=e.resolvedUrl,r=ue[e.behavior];if(r){const o=Se.loadBootResource(r,e.name,n,t,e.behavior);return"string"==typeof o?function(e){return"string"!=typeof e&&We(!1,"url must be a string"),!U(e)&&0!==e.indexOf("./")&&0!==e.indexOf("../")&&globalThis.URL&&globalThis.document&&globalThis.document.baseURI&&(e=new URL(e,globalThis.document.baseURI).toString()),e}(o):o}}}function me(e){e.pendingDownloadInternal=null,e.pendingDownload=null,e.buffer=null,e.moduleExports=null}function ge(e){let o=e.lastIndexOf("/");return o>=0&&o++,e.substring(o)}async function pe(e){e&&await Promise.all((null!=e?e:[]).map(e=>async function(e){try{const o=e.name;if(!e.moduleExports){const t=ae(Se.locateFile(o),"js-module-library-initializer");Se.diagnosticTracing&&b(`Attempting to import '${t}' for ${e}`),e.moduleExports=await import(/*! webpackIgnore: true */t)}Se.libraryInitializers.push({scriptName:o,exports:e.moduleExports})}catch(o){v(`Failed to import library initializer '${e}': ${o}`)}}(e)))}async function he(e,o){if(!Se.libraryInitializers)return;const t=[];for(let n=0;n<Se.libraryInitializers.length;n++){const r=Se.libraryInitializers[n];r.exports[e]&&t.push(be(r.scriptName,e,()=>r.exports[e](...o)))}await Promise.all(t)}async function be(e,o,t){try{await t()}catch(t){throw v(`Failed to invoke '${o}' on library initializer '${e}': ${t}`),Ge(1,t),t}}function we(e,o){if(e===o)return e;const t={...o};return void 0!==t.assets&&t.assets!==e.assets&&(t.assets=[...e.assets||[],...t.assets||[]]),void 0!==t.resources&&(t.resources=ve(e.resources||{assembly:[],jsModuleNative:[],jsModuleRuntime:[],wasmNative:[]},t.resources)),void 0!==t.environmentVariables&&(t.environmentVariables={...e.environmentVariables||{},...t.environmentVariables||{}}),void 0!==t.runtimeOptions&&t.runtimeOptions!==e.runtimeOptions&&(t.runtimeOptions=[...e.runtimeOptions||[],...t.runtimeOptions||[]]),Object.assign(e,t)}function ye(e,o){if(e===o)return e;const t={...o};return t.config&&(e.config||(e.config={}),t.config=we(e.config,t.config)),Object.assign(e,t)}function ve(e,o){if(e===o)return e;const t={...o};return void 0!==t.coreAssembly&&(t.coreAssembly=[...e.coreAssembly||[],...t.coreAssembly||[]]),void 0!==t.assembly&&(t.assembly=[...e.assembly||[],...t.assembly||[]]),void 0!==t.lazyAssembly&&(t.lazyAssembly=[...e.lazyAssembly||[],...t.lazyAssembly||[]]),void 0!==t.corePdb&&(t.corePdb=[...e.corePdb||[],...t.corePdb||[]]),void 0!==t.pdb&&(t.pdb=[...e.pdb||[],...t.pdb||[]]),void 0!==t.jsModuleWorker&&(t.jsModuleWorker=[...e.jsModuleWorker||[],...t.jsModuleWorker||[]]),void 0!==t.jsModuleNative&&(t.jsModuleNative=[...e.jsModuleNative||[],...t.jsModuleNative||[]]),void 0!==t.jsModuleDiagnostics&&(t.jsModuleDiagnostics=[...e.jsModuleDiagnostics||[],...t.jsModuleDiagnostics||[]]),void 0!==t.jsModuleRuntime&&(t.jsModuleRuntime=[...e.jsModuleRuntime||[],...t.jsModuleRuntime||[]]),void 0!==t.wasmSymbols&&(t.wasmSymbols=[...e.wasmSymbols||[],...t.wasmSymbols||[]]),void 0!==t.wasmNative&&(t.wasmNative=[...e.wasmNative||[],...t.wasmNative||[]]),void 0!==t.icu&&(t.icu=[...e.icu||[],...t.icu||[]]),void 0!==t.satelliteResources&&(t.satelliteResources=function(e,o){if(e===o)return e;for(const t in o)e[t]=[...e[t]||[],...o[t]||[]];return e}(e.satelliteResources||{},t.satelliteResources||{})),void 0!==t.modulesAfterConfigLoaded&&(t.modulesAfterConfigLoaded=[...e.modulesAfterConfigLoaded||[],...t.modulesAfterConfigLoaded||[]]),void 0!==t.modulesAfterRuntimeReady&&(t.modulesAfterRuntimeReady=[...e.modulesAfterRuntimeReady||[],...t.modulesAfterRuntimeReady||[]]),void 0!==t.extensions&&(t.extensions={...e.extensions||{},...t.extensions||{}}),void 0!==t.vfs&&(t.vfs=[...e.vfs||[],...t.vfs||[]]),Object.assign(e,t)}function _e(){const e=Se.config;if(e.environmentVariables=e.environmentVariables||{},e.runtimeOptions=e.runtimeOptions||[],e.resources=e.resources||{assembly:[],jsModuleNative:[],jsModuleWorker:[],jsModuleRuntime:[],wasmNative:[],vfs:[],satelliteResources:{}},e.assets){Se.diagnosticTracing&&b("config.assets is deprecated, use config.resources instead");for(const o of e.assets){const t={};switch(o.behavior){case"assembly":t.assembly=[o];break;case"pdb":t.pdb=[o];break;case"resource":t.satelliteResources={},t.satelliteResources[o.culture]=[o];break;case"icu":t.icu=[o];break;case"symbols":t.wasmSymbols=[o];break;case"vfs":t.vfs=[o];break;case"dotnetwasm":t.wasmNative=[o];break;case"js-module-threads":t.jsModuleWorker=[o];break;case"js-module-runtime":t.jsModuleRuntime=[o];break;case"js-module-native":t.jsModuleNative=[o];break;case"js-module-diagnostics":t.jsModuleDiagnostics=[o];break;case"js-module-dotnet":break;default:throw new Error(`Unexpected behavior ${o.behavior} of asset ${o.name}`)}ve(e.resources,t)}}e.debugLevel,void 0===e.virtualWorkingDirectory&&(e.virtualWorkingDirectory=Me),e.applicationEnvironment||(e.applicationEnvironment="Production"),e.applicationCulture&&(e.environmentVariables.LANG=`${e.applicationCulture}.UTF-8`),Pe.diagnosticTracing=Se.diagnosticTracing=!!e.diagnosticTracing,Pe.waitForDebugger=e.waitForDebugger,Se.maxParallelDownloads=e.maxParallelDownloads||Se.maxParallelDownloads,Se.enableDownloadRetry=void 0!==e.enableDownloadRetry?e.enableDownloadRetry:Se.enableDownloadRetry}let je=!1;async function xe(e){var o;if(je)await Se.afterConfigLoaded.promise;else try{if(je=!0,_e(),await pe(null===(o=Se.config.resources)||void 0===o?void 0:o.modulesAfterConfigLoaded),await he("onRuntimeConfigLoaded",[Se.config]),e.onConfigLoaded)try{await e.onConfigLoaded(Se.config,Ie),_e()}catch(e){throw _("onConfigLoaded() failed",e),e}_e(),Se.afterConfigLoaded.promise_control.resolve(Se.config)}catch(o){const t=`Failed to initialize config ${o} ${null==o?void 0:o.stack}`;throw Se.config=e.config=Object.assign(Se.config,{message:t,error:o,isError:!0}),Ge(1,new Error(t)),o}}function Re(){return!!globalThis.navigator&&(Se.isChromium||Se.isFirefox)}"function"==typeof importScripts&&(globalThis.dotnetSidecar=!0);const Te="object"==typeof process&&"object"==typeof process.versions&&"string"==typeof process.versions.node,Ee="function"==typeof importScripts,Ae=Ee&&"undefined"!=typeof dotnetSidecar,De=Ee&&!Ae,ke="object"==typeof window||Ee&&!Te,Ce=!ke&&!Te,Me="/";let Pe={},Se={},Ue={},Ie={},Oe={},$e=!1;const Ne={},Le={config:Ne},ze={mono:{},binding:{},internal:Oe,module:Le,loaderHelpers:Se,runtimeHelpers:Pe,diagnosticHelpers:Ue,api:Ie};function We(e,o){if(e)return;const t="Assert failed: "+("function"==typeof o?o():o),n=new Error(t);_(t,n),Pe.nativeAbort(n)}function Fe(){return void 0!==Se.exitCode}function Ve(){return Pe.runtimeReady&&!Fe()}function Be(){Fe()&&We(!1,`.NET runtime already exited with ${Se.exitCode} ${Se.exitReason}. You can use dotnet.runMain() which doesn't exit the runtime.`),Pe.runtimeReady||We(!1,".NET runtime didn't start yet. Please call dotnet.create() first.")}function He(){ke&&(globalThis.addEventListener("unhandledrejection",Xe),globalThis.addEventListener("error",Ye))}let Je,qe;function Qe(e){qe&&qe(e),Ge(e,Se.exitReason)}function Ze(e){Je&&Je(e||Se.exitReason),Ge(1,e||Se.exitReason)}function Ge(e,o){var t;const n=o&&"object"==typeof o;e=n&&"number"==typeof o.status?o.status:void 0===e?-1:e;const r=n&&"string"==typeof o.message?o.message:""+o;(o=n?o:Pe.ExitStatus?function(e,o){const t=new Pe.ExitStatus(e);return t.message=o,t.toString=()=>o,t}(e,r):new Error("Exit with code "+e+" "+r)).status=e,o.message||(o.message=r);const s=""+(o.stack||(new Error).stack);try{Object.defineProperty(o,"stack",{get:()=>s})}catch(e){}const i=!!o.silent;if(o.silent=!0,Fe())Se.diagnosticTracing&&b("mono_exit called after exit");else{try{Le.onAbort==Ze&&(Le.onAbort=Je),Le.onExit==Qe&&(Le.onExit=qe),ke&&(globalThis.removeEventListener("unhandledrejection",Xe),globalThis.removeEventListener("error",Ye)),Pe.runtimeReady?(Pe.jiterpreter_dump_stats&&Pe.jiterpreter_dump_stats(!1),0===e&&(null===(t=Se.config)||void 0===t?void 0:t.interopCleanupOnExit)&&Pe.forceDisposeProxies(!0,!0)):(Se.diagnosticTracing&&b(`abort_startup, reason: ${o}`),function(e){Se.allDownloadsQueued.promise_control.reject(e),Se.allDownloadsFinished.promise_control.reject(e),Se.afterConfigLoaded.promise_control.reject(e),Se.wasmCompilePromise.promise_control.reject(e),Se.runtimeModuleLoaded.promise_control.reject(e),Pe.dotnetReady&&(Pe.dotnetReady.promise_control.reject(e),Pe.afterInstantiateWasm.promise_control.reject(e),Pe.afterPreRun.promise_control.reject(e),Pe.beforeOnRuntimeInitialized.promise_control.reject(e),Pe.afterOnRuntimeInitialized.promise_control.reject(e),Pe.afterPostRun.promise_control.reject(e))}(o))}catch(e){v("mono_exit A failed",e)}try{i||(function(e,o){if(0!==e&&o){const e=Pe.ExitStatus&&o instanceof Pe.ExitStatus?b:_;"string"==typeof o?e(o):(void 0===o.stack&&(o.stack=(new Error).stack+""),o.message?e(Pe.stringify_as_error_with_stack?Pe.stringify_as_error_with_stack(o.message+"\n"+o.stack):o.message+"\n"+o.stack):e(JSON.stringify(o)))}!De&&Se.config&&(Se.config.logExitCode?Se.config.forwardConsole?R("WASM EXIT "+e):y("WASM EXIT "+e):Se.config.forwardConsole&&R())}(e,o),function(e){if(ke&&!De&&Se.config&&Se.config.appendElementOnExit&&document){const o=document.createElement("label");o.id="tests_done",0!==e&&(o.style.background="red"),o.innerHTML=""+e,document.body.appendChild(o)}}(e))}catch(e){v("mono_exit B failed",e)}Se.exitCode=e,Se.exitReason||(Se.exitReason=o),!De&&Pe.runtimeReady&&Le.runtimeKeepalivePop()}if(Se.config&&Se.config.asyncFlushOnExit&&0===e)throw(async()=>{try{await async function(){try{const e=await import(/*! webpackIgnore: true */"process"),o=e=>new Promise((o,t)=>{e.on("error",t),e.end("","utf8",o)}),t=o(e.stderr),n=o(e.stdout);let r;const s=new Promise(e=>{r=setTimeout(()=>e("timeout"),1e3)});await Promise.race([Promise.all([n,t]),s]),clearTimeout(r)}catch(e){_(`flushing std* streams failed: ${e}`)}}()}finally{Ke(e,o)}})(),o;Ke(e,o)}function Ke(e,o){if(Pe.runtimeReady&&Pe.nativeExit)try{Pe.nativeExit(e)}catch(e){!Pe.ExitStatus||e instanceof Pe.ExitStatus||v("set_exit_code_and_quit_now failed: "+e.toString())}if(0!==e||!ke)throw Te?process.exit(e):Pe.quit&&Pe.quit(e,o),o}function Xe(e){eo(e,e.reason,"rejection")}function Ye(e){eo(e,e.error,"error")}function eo(e,o,t){e.preventDefault();try{o||(o=new Error("Unhandled "+t)),void 0===o.stack&&(o.stack=(new Error).stack),o.stack=o.stack+"",o.silent||(_("Unhandled error:",o),Ge(1,o))}catch(e){}}!function(n){if($e)throw new Error("Loader module already loaded");$e=!0,Pe=n.runtimeHelpers,Se=n.loaderHelpers,Ue=n.diagnosticHelpers,Ie=n.api,Oe=n.internal,Object.assign(Ie,{INTERNAL:Oe,invokeLibraryInitializers:he}),Object.assign(n.module,{config:we(Ne,{environmentVariables:{}})});const a={mono_wasm_bindings_is_ready:!1,config:n.module.config,diagnosticTracing:!1,nativeAbort:e=>{throw e||new Error("abort")},nativeExit:e=>{throw new Error("exit:"+e)}},l={gitHash:"1616fce88662817fb8b76911fb188b56650859a0",config:n.module.config,diagnosticTracing:!1,maxParallelDownloads:16,enableDownloadRetry:!0,_loaded_files:[],loadedFiles:[],loadedAssemblies:[],libraryInitializers:[],workerNextNumber:1,actual_downloaded_assets_count:0,actual_instantiated_assets_count:0,expected_downloaded_assets_count:0,expected_instantiated_assets_count:0,afterConfigLoaded:r(),allDownloadsQueued:r(),allDownloadsFinished:r(),wasmCompilePromise:r(),runtimeModuleLoaded:r(),loadingWorkers:r(),is_exited:Fe,is_runtime_running:Ve,assert_runtime_running:Be,mono_exit:Ge,createPromiseController:r,getPromiseController:s,assertIsControllablePromise:i,mono_download_assets:ee,resolve_single_asset_path:X,setup_proxy_console:x,set_thread_prefix:h,installUnhandledErrorHandler:He,retrieve_asset_download:ne,invokeLibraryInitializers:he,isDebuggingSupported:Re,exceptions:e,simd:t,relaxedSimd:o};Object.assign(Pe,a),Object.assign(Se,l)}(ze);let oo,to,no,ro=!1,so=!1;async function io(e){if(!so){if(so=!0,ke&&Se.config.forwardConsole&&void 0!==globalThis.WebSocket&&x("main",globalThis.console,globalThis.location.origin),Le||We(!1,"Null moduleConfig"),Se.config||We(!1,"Null moduleConfig.config"),"function"==typeof e){const o=e(ze.api);if(o.ready)throw new Error("Module.ready couldn't be redefined.");Object.assign(Le,o),ye(Le,o)}else{if("object"!=typeof e)throw new Error("Can't use moduleFactory callback of createDotnetRuntime function.");ye(Le,e)}await async function(e){if(Te){const e=await import(/*! webpackIgnore: true */"process"),o=14;if(e.versions.node.split(".")[0]<o)throw new Error(`NodeJS at '${e.execPath}' has too low version '${e.versions.node}', please use at least ${o}.`)}const o=/*! webpackIgnore: true */import.meta.url,t=o.indexOf("?");var n;if(t>0&&(Se.modulesUniqueQuery=o.substring(t)),Se.scriptUrl=o.replace(/\\/g,"/").replace(/[?#].*/,""),Se.scriptDirectory=(n=Se.scriptUrl).slice(0,n.lastIndexOf("/"))+"/",Se.locateFile=e=>"URL"in globalThis&&globalThis.URL!==C?new URL(e,Se.scriptDirectory).toString():U(e)?e:Se.scriptDirectory+e,Se.fetch_like=M,Se.out=console.log,Se.err=console.error,Se.onDownloadResourceProgress=e.onDownloadResourceProgress,ke&&globalThis.navigator){const e=globalThis.navigator,o=e.userAgentData&&e.userAgentData.brands;o&&o.length>0?Se.isChromium=o.some(e=>"Google Chrome"===e.brand||"Microsoft Edge"===e.brand||"Chromium"===e.brand):e.userAgent&&(Se.isChromium=e.userAgent.includes("Chrome"),Se.isFirefox=e.userAgent.includes("Firefox"))}void 0===globalThis.URL&&(globalThis.URL=C)}(Le)}}async function ao(e){return await io(e),Se.config.exitOnUnhandledError&&He(),Je=Le.onAbort,qe=Le.onExit,Le.onAbort=Ze,Le.onExit=Qe,Le.ENVIRONMENT_IS_PTHREAD?async function(){(function(){const e=new MessageChannel,o=e.port1,t=e.port2;o.addEventListener("message",e=>{var n,r;n=JSON.parse(e.data.config),r=JSON.parse(e.data.monoThreadInfo),ro?Se.diagnosticTracing&&b("mono config already received"):(we(Se.config,n),Pe.monoThreadInfo=r,_e(),Se.diagnosticTracing&&b("mono config received"),ro=!0,Se.afterConfigLoaded.promise_control.resolve(Se.config),ke&&n.forwardConsole&&void 0!==globalThis.WebSocket&&Se.setup_proxy_console("worker-idle",console,globalThis.location.origin)),o.close(),t.close()},{once:!0}),o.start(),self.postMessage({[a]:{monoCmd:"preload",port:t}},[t])})(),await Se.afterConfigLoaded.promise,function(){const e=Se.config;e.assets||We(!1,"config.assets must be defined");for(const o of e.assets)G(o),q[o.behavior]&&N.push(o)}(),setTimeout(async()=>{try{await ee()}catch(e){Ge(1,e)}},0);const e=lo(),o=await Promise.all(e);return await co(o),Le}():async function(){var e;await xe(Le),te();const o=lo();(async function(){try{const e=X("dotnetwasm");await re(e),e&&e.pendingDownloadInternal&&e.pendingDownloadInternal.response||We(!1,"Can't load dotnet.native.wasm");const o=await e.pendingDownloadInternal.response,t=o.headers&&o.headers.get?o.headers.get("Content-Type"):void 0;let n;if("function"==typeof WebAssembly.compileStreaming&&"application/wasm"===t)n=await WebAssembly.compileStreaming(o);else{ke&&"application/wasm"!==t&&v('WebAssembly resource does not have the expected content type "application/wasm", so falling back to slower ArrayBuffer instantiation.');const e=await o.arrayBuffer();Se.diagnosticTracing&&b("instantiate_wasm_module buffered"),n=Ce?await Promise.resolve(new WebAssembly.Module(e)):await WebAssembly.compile(e)}e.pendingDownloadInternal=null,e.pendingDownload=null,e.buffer=null,e.moduleExports=null,Se.wasmCompilePromise.promise_control.resolve(n)}catch(e){Se.wasmCompilePromise.promise_control.reject(e)}})(),setTimeout(async()=>{try{D(),await ee()}catch(e){Ge(1,e)}},0);const t=await Promise.all(o);return await co(t),await Pe.dotnetReady.promise,await pe(null===(e=Se.config.resources)||void 0===e?void 0:e.modulesAfterRuntimeReady),await he("onRuntimeReady",[ze.api]),Ie}()}function lo(){const e=X("js-module-runtime"),o=X("js-module-native");if(oo&&to)return[oo,to,no];"object"==typeof e.moduleExports?oo=e.moduleExports:(Se.diagnosticTracing&&b(`Attempting to import '${e.resolvedUrl}' for ${e.name}`),oo=import(/*! webpackIgnore: true */e.resolvedUrl)),"object"==typeof o.moduleExports?to=o.moduleExports:(Se.diagnosticTracing&&b(`Attempting to import '${o.resolvedUrl}' for ${o.name}`),to=import(/*! webpackIgnore: true */o.resolvedUrl));const t=K("js-module-diagnostics");return t&&("object"==typeof t.moduleExports?no=t.moduleExports:(Se.diagnosticTracing&&b(`Attempting to import '${t.resolvedUrl}' for ${t.name}`),no=import(/*! webpackIgnore: true */t.resolvedUrl))),[oo,to,no]}async function co(e){const{initializeExports:o,initializeReplacements:t,configureRuntimeStartup:n,configureEmscriptenStartup:r,configureWorkerStartup:s,setRuntimeGlobals:i,passEmscriptenInternals:a}=e[0],{default:l}=e[1],c=e[2];i(ze),o(ze),c&&c.setRuntimeGlobals(ze),await n(Le),Se.runtimeModuleLoaded.promise_control.resolve(),l(()=>(Object.assign(Le,{__dotnet_runtime:{initializeReplacements:t,configureEmscriptenStartup:r,configureWorkerStartup:s,passEmscriptenInternals:a}}),Le)).catch(e=>{if(e.message&&e.message.toLowerCase().includes("out of memory"))throw new Error(".NET runtime has failed to start, because too much memory was requested. Please decrease the memory by adjusting EmccMaximumHeapSize.");throw e})}const uo=new class{withModuleConfig(e){try{return ye(Le,e),this}catch(e){throw Ge(1,e),e}}withInterpreterPgo(e,o){try{return we(Ne,{interpreterPgo:e,interpreterPgoSaveDelay:o}),Ne.runtimeOptions?Ne.runtimeOptions.push("--interp-pgo-recording"):Ne.runtimeOptions=["--interp-pgo-recording"],this}catch(e){throw Ge(1,e),e}}withConfig(e){try{return we(Ne,e),this}catch(e){throw Ge(1,e),e}}withConfigSrc(e){return this}withVirtualWorkingDirectory(e){try{return e&&"string"==typeof e||We(!1,"must be directory path"),we(Ne,{virtualWorkingDirectory:e}),this}catch(e){throw Ge(1,e),e}}withEnvironmentVariable(e,o){try{const t={};return t[e]=o,we(Ne,{environmentVariables:t}),this}catch(e){throw Ge(1,e),e}}withEnvironmentVariables(e){try{return e&&"object"==typeof e||We(!1,"must be dictionary object"),we(Ne,{environmentVariables:e}),this}catch(e){throw Ge(1,e),e}}withDiagnosticTracing(e){try{return"boolean"!=typeof e&&We(!1,"must be boolean"),we(Ne,{diagnosticTracing:e}),this}catch(e){throw Ge(1,e),e}}withDebugging(e){try{return null!=e&&"number"==typeof e||We(!1,"must be number"),we(Ne,{debugLevel:e}),this}catch(e){throw Ge(1,e),e}}withApplicationArguments(...e){try{return e&&Array.isArray(e)||We(!1,"must be array of strings"),we(Ne,{applicationArguments:e}),this}catch(e){throw Ge(1,e),e}}withRuntimeOptions(e){try{return e&&Array.isArray(e)||We(!1,"must be array of strings"),Ne.runtimeOptions?Ne.runtimeOptions.push(...e):Ne.runtimeOptions=e,this}catch(e){throw Ge(1,e),e}}withMainAssembly(e){try{return we(Ne,{mainAssemblyName:e}),this}catch(e){throw Ge(1,e),e}}withApplicationArgumentsFromQuery(){try{if(!globalThis.window)throw new Error("Missing window to the query parameters from");if(void 0===globalThis.URLSearchParams)throw new Error("URLSearchParams is supported");const e=new URLSearchParams(globalThis.window.location.search).getAll("arg");return this.withApplicationArguments(...e)}catch(e){throw Ge(1,e),e}}withApplicationEnvironment(e){try{return we(Ne,{applicationEnvironment:e}),this}catch(e){throw Ge(1,e),e}}withApplicationCulture(e){try{return we(Ne,{applicationCulture:e}),this}catch(e){throw Ge(1,e),e}}withResourceLoader(e){try{return Se.loadBootResource=e,this}catch(e){throw Ge(1,e),e}}async download(){try{await async function(){io(Le),await xe(Le),te(),D(),ee(),await Se.allDownloadsFinished.promise}()}catch(e){throw Ge(1,e),e}}async create(){try{return this.instance||(this.instance=await async function(){return await ao(Le),ze.api}()),this.instance}catch(e){throw Ge(1,e),e}}run(){return this.runMainAndExit()}async runMainAndExit(){try{return Le.config||We(!1,"Null moduleConfig.config"),this.instance||await this.create(),this.instance.runMainAndExit()}catch(e){throw Ge(1,e),e}}async runMain(){try{return Le.config||We(!1,"Null moduleConfig.config"),this.instance||await this.create(),this.instance.runMain()}catch(e){throw Ge(1,e),e}}},fo=Ge,mo=ao;Ce||"function"==typeof globalThis.URL||We(!1,"This browser/engine doesn't support URL API. Please use a modern version."),"function"!=typeof globalThis.BigInt64Array&&We(!1,"This browser/engine doesn't support BigInt64Array API. Please use a modern version. See also https://learn.microsoft.com/aspnet/core/blazor/supported-platforms"),globalThis.performance&&"function"==typeof globalThis.performance.now||We(!1,"This browser/engine doesn't support performance.now. Please use a modern version."),Ce||globalThis.crypto&&"object"==typeof globalThis.crypto.subtle||We(!1,"This engine doesn't support crypto.subtle. Please use a modern version."),Ce||globalThis.crypto&&"function"==typeof globalThis.crypto.getRandomValues||We(!1,"This engine doesn't support crypto.getRandomValues. Please use a modern version."),Te&&"function"!=typeof process.exit&&We(!1,"This engine doesn't support process.exit. Please use a modern version."),uo.withConfig(/*json-start*/{
  "mainAssemblyName": "BenchViewer",
  "resources": {
    "hash": "sha256-Pmy7WZARH6YQ+dypUyAuIcLYYMdx5Qv8b+qN++gIHfE=",
    "jsModuleNative": [
      {
        "name": "dotnet.native.9431j90ghm.js"
      }
    ],
    "jsModuleRuntime": [
      {
        "name": "dotnet.runtime.7w034ph630.js"
      }
    ],
    "wasmNative": [
      {
        "name": "dotnet.native.899eot6mva.wasm",
        "hash": "sha256-pE1/bC8wiXLdEhr/fnZQ9fHHpVWin+xff3gOkKUrlx0=",
        "cache": "force-cache"
      }
    ],
    "icu": [
      {
        "virtualPath": "icudt_CJK.dat",
        "name": "icudt_CJK.5lgyv9xn0b.dat",
        "hash": "sha256-eZuX0pntrUwNrAmFCMwpxJjFA3/Myi/rW2x9mEZ+Mbg=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "icudt_EFIGS.dat",
        "name": "icudt_EFIGS.xyuimhy3ww.dat",
        "hash": "sha256-SQcxb+bdx2UXUCU9tFdOWCr4Ctk64xghCnr0JGLWWKQ=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "icudt_no_CJK.dat",
        "name": "icudt_no_CJK.h0en30vv0c.dat",
        "hash": "sha256-T8YllylpxyWp9Aq4AiF+BMAxKXqYyzWB9RA5RqY19vs=",
        "cache": "force-cache"
      }
    ],
    "coreAssembly": [
      {
        "virtualPath": "System.Runtime.InteropServices.JavaScript.wasm",
        "name": "System.Runtime.InteropServices.JavaScript.02sz59n551.wasm",
        "hash": "sha256-OO47OazgB6KO7sWhl65wLMEMjBL9/OZUtc0EQTbjIvE=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Private.CoreLib.wasm",
        "name": "System.Private.CoreLib.fqv0hb0cue.wasm",
        "hash": "sha256-p11aE87htFRkHGrWr7TR+ZnuC5jD5BenXwiMckAMYx0=",
        "cache": "force-cache"
      }
    ],
    "assembly": [
      {
        "virtualPath": "Microsoft.AspNetCore.Components.wasm",
        "name": "Microsoft.AspNetCore.Components.2e6nvvic89.wasm",
        "hash": "sha256-GvvaCkIMaKED19usC5IhzabFxnsoi/o/a7WeWE70qLs=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.AspNetCore.Components.Web.wasm",
        "name": "Microsoft.AspNetCore.Components.Web.k3ov34hcv4.wasm",
        "hash": "sha256-QPGHmusKYBb43mB2wQbKq5abbhS0wkkSZzyZ4DbUmTs=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.AspNetCore.Components.WebAssembly.wasm",
        "name": "Microsoft.AspNetCore.Components.WebAssembly.8mh8zjt3y4.wasm",
        "hash": "sha256-MMrSVMVWmd0ZgguCfj2Foxvo20zUiGsAklohX/B7nQ8=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.Extensions.Configuration.wasm",
        "name": "Microsoft.Extensions.Configuration.ri8t3yd2p2.wasm",
        "hash": "sha256-Y8uMuNa4FSxL8heJPdr+FCrb8zwXZqprCiNmg3mxBG8=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.Extensions.Configuration.EnvironmentVariables.wasm",
        "name": "Microsoft.Extensions.Configuration.EnvironmentVariables.8sfifdxu6n.wasm",
        "hash": "sha256-aHM298/In9xbK6s5NHGYo29N7rya24DIw6iSUZB7X0Q=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.Extensions.Configuration.Json.wasm",
        "name": "Microsoft.Extensions.Configuration.Json.tvr03j8pxj.wasm",
        "hash": "sha256-KVzxzGxpmDk3eF91vOBe6CPzpOKipiHte32dNHDLUC0=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.Extensions.DependencyInjection.wasm",
        "name": "Microsoft.Extensions.DependencyInjection.h9y924s09a.wasm",
        "hash": "sha256-tafrp+tR/3UHzXGUjF0Uu8AwmtSBRA7bi2AdJB7mcKA=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.Extensions.Logging.wasm",
        "name": "Microsoft.Extensions.Logging.5hi82126ws.wasm",
        "hash": "sha256-d2roSvgD+Eq/LNDC2vcqFUZaOBgst4yWz0qo96lyCPc=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.JSInterop.wasm",
        "name": "Microsoft.JSInterop.v7hrtm1j7e.wasm",
        "hash": "sha256-67QBthUtOPdIRJnciYgqnHEPWxWraM0usrwbuhgwk1E=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.JSInterop.WebAssembly.wasm",
        "name": "Microsoft.JSInterop.WebAssembly.1latlydm3i.wasm",
        "hash": "sha256-K9jOFAnUNZSqjM0N3ztX+ZEVKNZUSwXxoxd2/h3bmzY=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.Extensions.Configuration.Abstractions.wasm",
        "name": "Microsoft.Extensions.Configuration.Abstractions.ow58nfo7sl.wasm",
        "hash": "sha256-6CLQKQR0dsplvq1xjnMSnINYLuIK44AsfVWenGXMoJ4=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.Extensions.DependencyInjection.Abstractions.wasm",
        "name": "Microsoft.Extensions.DependencyInjection.Abstractions.5xkj917d9y.wasm",
        "hash": "sha256-qe1CgNeXecVN693qZ8xu35N4pp0YulB+dpIXOvocXo0=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.Extensions.Hosting.Abstractions.wasm",
        "name": "Microsoft.Extensions.Hosting.Abstractions.9nqotnuxf5.wasm",
        "hash": "sha256-G0qlWkgd2fjYSF5wgpFkdtMWgp1/EPTm7z7SQ9f63C0=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.Extensions.Logging.Abstractions.wasm",
        "name": "Microsoft.Extensions.Logging.Abstractions.2rqsvs52x0.wasm",
        "hash": "sha256-kko+7xHJWSLcYUrFIpeRZE0iBbf2Vv+09VU4r3hH5aQ=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.Extensions.Options.wasm",
        "name": "Microsoft.Extensions.Options.mtkctn2hug.wasm",
        "hash": "sha256-ak2TCpoXumc+X+Od9gBq7etlWrSB/eFfkVea1BBJopo=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.Extensions.Primitives.wasm",
        "name": "Microsoft.Extensions.Primitives.hn5hqduvqt.wasm",
        "hash": "sha256-I3uzB7aCuXGw8AOjyNLFl+scNuuQ0cREVnAeeUKdYdw=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Collections.Concurrent.wasm",
        "name": "System.Collections.Concurrent.f4tbt0xy1x.wasm",
        "hash": "sha256-0cplTkeVJwfSTlBF2dZ4MuCjPPWpORcdmc1mYxRyv9U=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Collections.Immutable.wasm",
        "name": "System.Collections.Immutable.qnk87otm7u.wasm",
        "hash": "sha256-as5pnd831O/lAVhYaEw43ykA7sW1MyN7H2wr8f/YZ2Y=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Collections.wasm",
        "name": "System.Collections.izi2pvrk50.wasm",
        "hash": "sha256-Yu56s/sif0jaRowbC6srK++kAjz+EONl34nmWqbqd8Q=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.ComponentModel.wasm",
        "name": "System.ComponentModel.nc1yg5hl48.wasm",
        "hash": "sha256-qTDJPPPFJEqB8dlkFQ8RVNDczBEHriFn+KaYR5U+QXc=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Console.wasm",
        "name": "System.Console.cabra12kd3.wasm",
        "hash": "sha256-HIAtTziIrtn1j3sHOMzLx66SppherFvVOpNU3e5NdPo=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Diagnostics.DiagnosticSource.wasm",
        "name": "System.Diagnostics.DiagnosticSource.twcrss9uul.wasm",
        "hash": "sha256-4+mvt4vmuAT0C+xfk2IuhAU8dTc9rAkeU09lo1L08Fc=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.IO.Pipelines.wasm",
        "name": "System.IO.Pipelines.y41e2nukgt.wasm",
        "hash": "sha256-viTJw7DgEr72HtftZWdEE7kb0d2Q/vrJSTIZ05cwjEE=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Linq.wasm",
        "name": "System.Linq.m6tah40awu.wasm",
        "hash": "sha256-woyDc/Lx5orbSjK03GSLX8CSnfIteaMPx6yT0XkXPcs=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Memory.wasm",
        "name": "System.Memory.d3zxx9e2xa.wasm",
        "hash": "sha256-6RQuhG6bmLVqQMtjUZSyP7Osj9hcXwCrC4QE8gCycJM=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Net.Http.Json.wasm",
        "name": "System.Net.Http.Json.ozgj86h1uv.wasm",
        "hash": "sha256-xAzz9ycjXm5r745afUCS3A+++qta/JF32c2oLDAXjFQ=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Net.Http.wasm",
        "name": "System.Net.Http.suo9bswfxb.wasm",
        "hash": "sha256-FIG/OBYzbTdSgFDqgFt6Spfu24wy6FDBBf1E1l+eWe0=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Net.Primitives.wasm",
        "name": "System.Net.Primitives.bf251eiw2t.wasm",
        "hash": "sha256-eatwDRN0ZiSMTLWf3ay3gg1Xvtu6cuOC7c/eeHTFDmI=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Private.Uri.wasm",
        "name": "System.Private.Uri.wllheuqtij.wasm",
        "hash": "sha256-XJKKoo4bnIPEZs66ew4pyrjH1YmIIVbWUpu7imTTMPU=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Runtime.wasm",
        "name": "System.Runtime.519aut8wg7.wasm",
        "hash": "sha256-OT4Z01r6r2NWa38yHsm8ACWYscnrDttGH82CuzPipFg=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Security.Cryptography.wasm",
        "name": "System.Security.Cryptography.hnc16ngxuc.wasm",
        "hash": "sha256-TbjE0EGSRt9py0+uaWZqvyQY//6bqth9tXqHOvj5xrY=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Text.Encodings.Web.wasm",
        "name": "System.Text.Encodings.Web.0wgw7cm7wz.wasm",
        "hash": "sha256-gKuKMn0D9uu33J8JWxcpKRGsWT5Q+OEEyul2ctLS9aA=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Text.Json.wasm",
        "name": "System.Text.Json.5zyx5qdwme.wasm",
        "hash": "sha256-UczWyKRw/zc99qedrFIMNODYKiQEuyJtrQfnoumXXls=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Text.RegularExpressions.wasm",
        "name": "System.Text.RegularExpressions.u5tihcnl3u.wasm",
        "hash": "sha256-InWBvlABdQtxwTiXRiY3BSnnIZZFfGTgO68yGWz4uCE=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "BenchViewer.wasm",
        "name": "BenchViewer.dgno1qnhqr.wasm",
        "hash": "sha256-vYXih8UVtLQqIN9BwO+Bh8+8VOSsZ2bdAo2gTK1Teps=",
        "cache": "force-cache"
      }
    ]
  },
  "debugLevel": 0,
  "globalizationMode": "sharded",
  "extensions": {
    "blazor": {}
  },
  "runtimeConfig": {
    "runtimeOptions": {
      "configProperties": {
        "Microsoft.AspNetCore.Components.Routing.RegexConstraintSupport": false,
        "Microsoft.Extensions.DependencyInjection.VerifyOpenGenericServiceTrimmability": true,
        "System.ComponentModel.DefaultValueAttribute.IsSupported": false,
        "System.ComponentModel.Design.IDesignerHost.IsSupported": false,
        "System.ComponentModel.TypeConverter.EnableUnsafeBinaryFormatterInDesigntimeLicenseContextSerialization": false,
        "System.ComponentModel.TypeDescriptor.IsComObjectDescriptorSupported": false,
        "System.Data.DataSet.XmlSerializationIsSupported": false,
        "System.Diagnostics.Debugger.IsSupported": false,
        "System.Diagnostics.Metrics.Meter.IsSupported": false,
        "System.Diagnostics.Tracing.EventSource.IsSupported": false,
        "System.GC.Server": true,
        "System.Globalization.Invariant": false,
        "System.TimeZoneInfo.Invariant": false,
        "System.Linq.Enumerable.IsSizeOptimized": true,
        "System.Net.Http.EnableActivityPropagation": false,
        "System.Net.Http.WasmEnableStreamingResponse": true,
        "System.Net.SocketsHttpHandler.Http3Support": false,
        "System.Reflection.Metadata.MetadataUpdater.IsSupported": false,
        "System.Resources.ResourceManager.AllowCustomResourceTypes": false,
        "System.Resources.UseSystemResourceKeys": true,
        "System.Runtime.CompilerServices.RuntimeFeature.IsDynamicCodeSupported": true,
        "System.Runtime.InteropServices.BuiltInComInterop.IsSupported": false,
        "System.Runtime.InteropServices.EnableConsumingManagedCodeFromNativeHosting": false,
        "System.Runtime.InteropServices.EnableCppCLIHostActivation": false,
        "System.Runtime.InteropServices.Marshalling.EnableGeneratedComInterfaceComImportInterop": false,
        "System.Runtime.Serialization.EnableUnsafeBinaryFormatterSerialization": false,
        "System.StartupHookProvider.IsSupported": false,
        "System.Text.Encoding.EnableUnsafeUTF7Encoding": false,
        "System.Text.Json.JsonSerializer.IsReflectionEnabledByDefault": true,
        "System.Threading.Thread.EnableAutoreleasePool": false,
        "Microsoft.AspNetCore.Components.Endpoints.NavigationManager.DisableThrowNavigationException": false,
        "System.Diagnostics.StackTrace.IsLineNumberSupported": false,
        "System.Runtime.CompilerServices.RuntimeFeature.IsMultithreadingSupported": false
      }
    }
  }
}/*json-end*/);export{mo as default,uo as dotnet,fo as exit};
