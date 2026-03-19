//! Licensed to the .NET Foundation under one or more agreements.
//! The .NET Foundation licenses this file to you under the MIT license.

const e=async()=>WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,2,1,0,10,8,1,6,0,6,64,25,11,11])),o=async()=>WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,15,1,13,0,65,1,253,15,65,2,253,15,253,128,2,11])),t=async()=>WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11])),n=Symbol.for("wasm promise_control");function r(e,o){let t=null;const r=new Promise(function(n,r){t={isDone:!1,promise:null,resolve:o=>{t.isDone||(t.isDone=!0,n(o),e&&e())},reject:e=>{t.isDone||(t.isDone=!0,r(e),o&&o())}}});t.promise=r;const i=r;return i[n]=t,{promise:i,promise_control:t}}function i(e){return e[n]}function s(e){e&&function(e){return void 0!==e[n]}(e)||Be(!1,"Promise is not controllable")}const a="__mono_message__",l=["debug","log","trace","warn","info","error"],c="MONO_WASM: ";let d,u,f,m,g,p;function h(e){m=e}function b(e){if(Pe.diagnosticTracing){const o="function"==typeof e?e():e;console.debug(c+o)}}function w(e,...o){console.info(c+e,...o)}function y(e,...o){console.info(e,...o)}function v(e,...o){console.warn(c+e,...o)}function _(e,...o){if(o&&o.length>0&&o[0]&&"object"==typeof o[0]){if(o[0].silent)return;if(o[0].toString)return void console.error(c+e,o[0].toString())}console.error(c+e,...o)}function E(e,o,t){return function(...n){try{let r=n[0];if(void 0===r)r="undefined";else if(null===r)r="null";else if("function"==typeof r)r=r.toString();else if("string"!=typeof r)try{r=JSON.stringify(r)}catch(e){r=r.toString()}o(t?JSON.stringify({method:e,payload:r,arguments:n.slice(1)}):[e+r,...n.slice(1)])}catch(e){f.error(`proxyConsole failed: ${e}`)}}}function R(e,o,t){u=o,m=e,f={...o};const n=`${t}/console`.replace("https://","wss://").replace("http://","ws://");d=new WebSocket(n),d.addEventListener("error",x),d.addEventListener("close",A),function(){for(const e of l)u[e]=E(`console.${e}`,T,!0)}()}function j(e){let o=30;const t=()=>{d?0==d.bufferedAmount||0==o?(e&&y(e),function(){for(const e of l)u[e]=E(`console.${e}`,f.log,!1)}(),d.removeEventListener("error",x),d.removeEventListener("close",A),d.close(1e3,e),d=void 0):(o--,globalThis.setTimeout(t,100)):e&&f&&f.log(e)};t()}function T(e){d&&d.readyState===WebSocket.OPEN?d.send(e):f.log(e)}function x(e){f.error(`[${m}] proxy console websocket error: ${e}`,e)}function A(e){f.debug(`[${m}] proxy console websocket closed: ${e}`,e)}function D(){Pe.preferredIcuAsset=S(Pe.config);let e="invariant"==Pe.config.globalizationMode;if(!e)if(Pe.preferredIcuAsset)Pe.diagnosticTracing&&b("ICU data archive(s) available, disabling invariant mode");else{if("custom"===Pe.config.globalizationMode||"all"===Pe.config.globalizationMode||"sharded"===Pe.config.globalizationMode){const e="invariant globalization mode is inactive and no ICU data archives are available";throw _(`ERROR: ${e}`),new Error(e)}Pe.diagnosticTracing&&b("ICU data archive(s) not available, using invariant globalization mode"),e=!0,Pe.preferredIcuAsset=null}const o="DOTNET_SYSTEM_GLOBALIZATION_INVARIANT",t=Pe.config.environmentVariables;if(void 0===t[o]&&e&&(t[o]="1"),void 0===t.TZ)try{const e=Intl.DateTimeFormat().resolvedOptions().timeZone||null;e&&(t.TZ=e)}catch(e){w("failed to detect timezone, will fallback to UTC")}}function S(e){var o;if((null===(o=e.resources)||void 0===o?void 0:o.icu)&&"invariant"!=e.globalizationMode){const o=e.applicationCulture||(ke?globalThis.navigator&&globalThis.navigator.languages&&globalThis.navigator.languages[0]:Intl.DateTimeFormat().resolvedOptions().locale);e.applicationCulture||(e.applicationCulture=o);const t=e.resources.icu;let n=null;if("custom"===e.globalizationMode){if(t.length>=1)return t[0].name}else o&&"all"!==e.globalizationMode?"sharded"===e.globalizationMode&&(n=function(e){const o=e.split("-")[0];return"en"===o||["fr","fr-FR","it","it-IT","de","de-DE","es","es-ES"].includes(e)?"icudt_EFIGS.dat":["zh","ko","ja"].includes(o)?"icudt_CJK.dat":"icudt_no_CJK.dat"}(o)):n="icudt.dat";if(n)for(let e=0;e<t.length;e++){const o=t[e];if(o.virtualPath===n)return o.name}}return e.globalizationMode="invariant",null}(new Date).valueOf();const M=class{constructor(e){this.url=e}toString(){return this.url}};async function k(e,o){try{const t="function"==typeof globalThis.fetch;if(Ae){const n=e.startsWith("file://");if(!n&&t)return globalThis.fetch(e,o||{credentials:"same-origin"});g||(p=await import(/*! webpackIgnore: true */"url"),g=await import(/*! webpackIgnore: true */"fs")),n&&(e=p.fileURLToPath(e));const r=await g.promises.readFile(e);return{ok:!0,headers:{length:0,get:()=>null},url:e,arrayBuffer:()=>r,json:()=>JSON.parse(r),text:()=>{throw new Error("NotImplementedException")}}}if(t)return globalThis.fetch(e,o||{credentials:"same-origin"});if("function"==typeof read)return{ok:!0,url:e,headers:{length:0,get:()=>null},arrayBuffer:()=>new Uint8Array(read(e,"binary")),json:()=>JSON.parse(read(e,"utf8")),text:()=>read(e,"utf8")}}catch(o){return{ok:!1,url:e,status:500,headers:{length:0,get:()=>null},statusText:"ERR28: "+o,arrayBuffer:()=>{throw o},json:()=>{throw o},text:()=>{throw o}}}throw new Error("No fetch implementation available")}function C(e){return"string"!=typeof e&&Be(!1,"url must be a string"),!P(e)&&0!==e.indexOf("./")&&0!==e.indexOf("../")&&globalThis.URL&&globalThis.document&&globalThis.document.baseURI&&(e=new URL(e,globalThis.document.baseURI).toString()),e}const I=/^[a-zA-Z][a-zA-Z\d+\-.]*?:\/\//,O=/[a-zA-Z]:[\\/]/;function P(e){return Ae||Ce?e.startsWith("/")||e.startsWith("\\")||-1!==e.indexOf("///")||O.test(e):I.test(e)}let U,L=0;const N=[],$=[],z=new Map,W={"js-module-threads":!0,"js-module-runtime":!0,"js-module-dotnet":!0,"js-module-native":!0,"js-module-diagnostics":!0},F={...W,"js-module-library-initializer":!0},B={...W,dotnetwasm:!0,heap:!0,manifest:!0},V={...F,manifest:!0},H={...F,dotnetwasm:!0},J={dotnetwasm:!0,symbols:!0},q={...F,dotnetwasm:!0,symbols:!0},Q={symbols:!0};function G(e){return!("icu"==e.behavior&&e.name!=Pe.preferredIcuAsset)}function Z(e,o,t){null!=o||(o=[]),Be(1==o.length,`Expect to have one ${t} asset in resources`);const n=o[0];return n.behavior=t,K(n),e.push(n),n}function K(e){B[e.behavior]&&z.set(e.behavior,e)}function X(e){Be(B[e],`Unknown single asset behavior ${e}`);const o=z.get(e);if(o&&!o.resolvedUrl)if(o.resolvedUrl=Pe.locateFile(o.name),W[o.behavior]){const e=me(o);e?("string"!=typeof e&&Be(!1,"loadBootResource response for 'dotnetjs' type should be a URL string"),o.resolvedUrl=e):o.resolvedUrl=le(o.resolvedUrl,o.behavior)}else if("dotnetwasm"!==o.behavior)throw new Error(`Unknown single asset behavior ${e}`);return o}function Y(e){const o=X(e);return Be(o,`Single asset for ${e} not found`),o}let ee=!1;async function oe(){if(!ee){ee=!0,Pe.diagnosticTracing&&b("mono_download_assets");try{const e=[],o=[],t=(e,o)=>{!q[e.behavior]&&G(e)&&Pe.expected_instantiated_assets_count++,!H[e.behavior]&&G(e)&&(Pe.expected_downloaded_assets_count++,o.push(ie(e)))};for(const o of N)t(o,e);for(const e of $)t(e,o);Pe.allDownloadsQueued.promise_control.resolve(),Promise.all([...e,...o]).then(()=>{Pe.allDownloadsFinished.promise_control.resolve()}).catch(e=>{throw Pe.err("Error in mono_download_assets: "+e),Xe(1,e),e}),await Pe.runtimeModuleLoaded.promise;const n=async e=>{const o=await e;if(o.buffer){if(!q[o.behavior]){o.buffer&&"object"==typeof o.buffer||Be(!1,"asset buffer must be array-like or buffer-like or promise of these"),"string"!=typeof o.resolvedUrl&&Be(!1,"resolvedUrl must be string");const e=o.resolvedUrl,t=await o.buffer,n=new Uint8Array(t);ge(o),await Oe.beforeOnRuntimeInitialized.promise,await Oe.afterInstantiateWasm.promise,Oe.instantiate_asset(o,e,n)}}else J[o.behavior]?("symbols"===o.behavior&&(await Oe.instantiate_symbols_asset(o),ge(o)),J[o.behavior]&&++Pe.actual_downloaded_assets_count):(o.isOptional||Be(!1,"Expected asset to have the downloaded buffer"),!H[o.behavior]&&G(o)&&Pe.expected_downloaded_assets_count--,!q[o.behavior]&&G(o)&&Pe.expected_instantiated_assets_count--)},r=[],i=[];for(const o of e)r.push(n(o));for(const e of o)i.push(n(e));Promise.all(r).then(()=>{Me||Oe.coreAssetsInMemory.promise_control.resolve()}).catch(e=>{throw Pe.err("Error in mono_download_assets: "+e),Xe(1,e),e}),Promise.all(i).then(async()=>{Me||(await Oe.coreAssetsInMemory.promise,Oe.allAssetsInMemory.promise_control.resolve())}).catch(e=>{throw Pe.err("Error in mono_download_assets: "+e),Xe(1,e),e})}catch(e){throw Pe.err("Error in mono_download_assets: "+e),e}}}let te=!1;function ne(){if(te)return;te=!0;const e=Pe.config,o=[];if(e.assets)for(const o of e.assets)"object"!=typeof o&&Be(!1,`asset must be object, it was ${typeof o} : ${o}`),"string"!=typeof o.behavior&&Be(!1,"asset behavior must be known string"),"string"!=typeof o.name&&Be(!1,"asset name must be string"),o.resolvedUrl&&"string"!=typeof o.resolvedUrl&&Be(!1,"asset resolvedUrl could be string"),o.hash&&"string"!=typeof o.hash&&Be(!1,"asset resolvedUrl could be string"),o.pendingDownload&&"object"!=typeof o.pendingDownload&&Be(!1,"asset pendingDownload could be object"),o.isCore?N.push(o):$.push(o),K(o);else if(e.resources){const t=e.resources;t.wasmNative||Be(!1,"resources.wasmNative must be defined"),t.jsModuleNative||Be(!1,"resources.jsModuleNative must be defined"),t.jsModuleRuntime||Be(!1,"resources.jsModuleRuntime must be defined"),Z($,t.wasmNative,"dotnetwasm"),Z(o,t.jsModuleNative,"js-module-native"),Z(o,t.jsModuleRuntime,"js-module-runtime"),t.jsModuleDiagnostics&&Z(o,t.jsModuleDiagnostics,"js-module-diagnostics");const n=(e,o,t)=>{const n=e;n.behavior=o,t?(n.isCore=!0,N.push(n)):$.push(n)};if(t.coreAssembly)for(let e=0;e<t.coreAssembly.length;e++)n(t.coreAssembly[e],"assembly",!0);if(t.assembly)for(let e=0;e<t.assembly.length;e++)n(t.assembly[e],"assembly",!t.coreAssembly);if(0!=e.debugLevel&&Pe.isDebuggingSupported()){if(t.corePdb)for(let e=0;e<t.corePdb.length;e++)n(t.corePdb[e],"pdb",!0);if(t.pdb)for(let e=0;e<t.pdb.length;e++)n(t.pdb[e],"pdb",!t.corePdb)}if(e.loadAllSatelliteResources&&t.satelliteResources)for(const e in t.satelliteResources)for(let o=0;o<t.satelliteResources[e].length;o++){const r=t.satelliteResources[e][o];r.culture=e,n(r,"resource",!t.coreAssembly)}if(t.coreVfs)for(let e=0;e<t.coreVfs.length;e++)n(t.coreVfs[e],"vfs",!0);if(t.vfs)for(let e=0;e<t.vfs.length;e++)n(t.vfs[e],"vfs",!t.coreVfs);const r=S(e);if(r&&t.icu)for(let e=0;e<t.icu.length;e++){const o=t.icu[e];o.name===r&&n(o,"icu",!1)}if(t.wasmSymbols)for(let e=0;e<t.wasmSymbols.length;e++)n(t.wasmSymbols[e],"symbols",!1)}if(e.appsettings)for(let o=0;o<e.appsettings.length;o++){const t=e.appsettings[o],n=pe(t);"appsettings.json"!==n&&n!==`appsettings.${e.applicationEnvironment}.json`||$.push({name:t,behavior:"vfs",cache:"no-cache",useCredentials:!0})}e.assets=[...N,...$,...o]}async function re(e){const o=await ie(e);return await o.pendingDownloadInternal.response,o.buffer}async function ie(e){try{return await se(e)}catch(o){if(!Pe.enableDownloadRetry)throw o;if(Ce||Ae)throw o;if(e.pendingDownload&&e.pendingDownloadInternal==e.pendingDownload)throw o;if(e.resolvedUrl&&-1!=e.resolvedUrl.indexOf("file://"))throw o;if(o&&404==o.status)throw o;e.pendingDownloadInternal=void 0,await Pe.allDownloadsQueued.promise;try{return Pe.diagnosticTracing&&b(`Retrying download '${e.name}'`),await se(e)}catch(o){return e.pendingDownloadInternal=void 0,await new Promise(e=>globalThis.setTimeout(e,100)),Pe.diagnosticTracing&&b(`Retrying download (2) '${e.name}' after delay`),await se(e)}}}async function se(e){for(;U;)await U.promise;try{++L,L==Pe.maxParallelDownloads&&(Pe.diagnosticTracing&&b("Throttling further parallel downloads"),U=r());const o=await async function(e){if(e.pendingDownload&&(e.pendingDownloadInternal=e.pendingDownload),e.pendingDownloadInternal&&e.pendingDownloadInternal.response)return e.pendingDownloadInternal.response;if(e.buffer){const o=await e.buffer;return e.resolvedUrl||(e.resolvedUrl="undefined://"+e.name),e.pendingDownloadInternal={url:e.resolvedUrl,name:e.name,response:Promise.resolve({ok:!0,arrayBuffer:()=>o,json:()=>JSON.parse(new TextDecoder("utf-8").decode(o)),text:()=>{throw new Error("NotImplementedException")},headers:{get:()=>{}}})},e.pendingDownloadInternal.response}const o=e.loadRemote&&Pe.config.remoteSources?Pe.config.remoteSources:[""];let t;for(let n of o){n=n.trim(),"./"===n&&(n="");const o=ae(e,n);e.name===o?Pe.diagnosticTracing&&b(`Attempting to download '${o}'`):Pe.diagnosticTracing&&b(`Attempting to download '${o}' for ${e.name}`);try{e.resolvedUrl=o;const n=ue(e);if(e.pendingDownloadInternal=n,t=await n.response,!t||!t.ok)continue;return t}catch(e){t||(t={ok:!1,url:o,status:0,statusText:""+e});continue}}const n=e.isOptional||e.name.match(/\.pdb$/)&&Pe.config.ignorePdbLoadErrors;if(t||Be(!1,`Response undefined ${e.name}`),!n){const o=new Error(`download '${t.url}' for ${e.name} failed ${t.status} ${t.statusText}`);throw o.status=t.status,o}w(`optional download '${t.url}' for ${e.name} failed ${t.status} ${t.statusText}`)}(e);return o?(J[e.behavior]||(e.buffer=await o.arrayBuffer(),++Pe.actual_downloaded_assets_count),e):e}finally{if(--L,U&&L==Pe.maxParallelDownloads-1){Pe.diagnosticTracing&&b("Resuming more parallel downloads");const e=U;U=void 0,e.promise_control.resolve()}}}function ae(e,o){let t;return null==o&&Be(!1,`sourcePrefix must be provided for ${e.name}`),e.resolvedUrl?t=e.resolvedUrl:(t=""===o?"assembly"===e.behavior||"pdb"===e.behavior?e.name:"resource"===e.behavior&&e.culture&&""!==e.culture?`${e.culture}/${e.name}`:e.name:o+e.name,t=le(Pe.locateFile(t),e.behavior)),t&&"string"==typeof t||Be(!1,"attemptUrl need to be path or url string"),t}function le(e,o){return Pe.modulesUniqueQuery&&V[o]&&(e+=Pe.modulesUniqueQuery),e}let ce=0;const de=new Set;function ue(e){try{e.resolvedUrl||Be(!1,"Request's resolvedUrl must be set");const o=function(e){let o=e.resolvedUrl;if(Pe.loadBootResource){const t=me(e);if(t instanceof Promise)return t;"string"==typeof t&&(o=t)}const t={};return e.cache?t.cache=e.cache:Pe.config.disableNoCacheFetch||(t.cache="no-cache"),e.useCredentials?t.credentials="include":!Pe.config.disableIntegrityCheck&&e.hash&&(t.integrity=e.hash),Pe.fetch_like(o,t)}(e),t={name:e.name,url:e.resolvedUrl,response:o};return de.add(e.name),t.response.then(()=>{"assembly"==e.behavior&&Pe.loadedAssemblies.push(e.name),ce++,Pe.onDownloadResourceProgress&&Pe.onDownloadResourceProgress(ce,de.size)}),t}catch(o){const t={ok:!1,url:e.resolvedUrl,status:500,statusText:"ERR29: "+o,arrayBuffer:()=>{throw o},json:()=>{throw o}};return{name:e.name,url:e.resolvedUrl,response:Promise.resolve(t)}}}const fe={resource:"assembly",assembly:"assembly",pdb:"pdb",icu:"globalization",vfs:"configuration",manifest:"manifest",dotnetwasm:"dotnetwasm","js-module-dotnet":"dotnetjs","js-module-native":"dotnetjs","js-module-runtime":"dotnetjs","js-module-threads":"dotnetjs"};function me(e){var o;if(Pe.loadBootResource){const t=null!==(o=e.hash)&&void 0!==o?o:"",n=e.resolvedUrl,r=fe[e.behavior];if(r){const o=Pe.loadBootResource(r,e.name,n,t,e.behavior);return"string"==typeof o?C(o):o}}}function ge(e){e.pendingDownloadInternal=null,e.pendingDownload=null,e.buffer=null,e.moduleExports=null}function pe(e){let o=e.lastIndexOf("/");return o>=0&&o++,e.substring(o)}async function he(e){e&&await Promise.all((null!=e?e:[]).map(e=>async function(e){try{const o=e.name;if(!e.moduleExports){const t=le(Pe.locateFile(o),"js-module-library-initializer");Pe.diagnosticTracing&&b(`Attempting to import '${t}' for ${e}`),e.moduleExports=await import(/*! webpackIgnore: true */t)}Pe.libraryInitializers.push({scriptName:o,exports:e.moduleExports})}catch(o){v(`Failed to import library initializer '${e}': ${o}`)}}(e)))}async function be(e,o){if(!Pe.libraryInitializers)return;const t=[];for(let n=0;n<Pe.libraryInitializers.length;n++){const r=Pe.libraryInitializers[n];r.exports[e]&&t.push(we(r.scriptName,e,()=>r.exports[e](...o)))}await Promise.all(t)}async function we(e,o,t){try{await t()}catch(t){throw v(`Failed to invoke '${o}' on library initializer '${e}': ${t}`),Xe(1,t),t}}function ye(e,o){if(e===o)return e;const t={...o};return void 0!==t.assets&&t.assets!==e.assets&&(t.assets=[...e.assets||[],...t.assets||[]]),void 0!==t.resources&&(t.resources=_e(e.resources||{assembly:[],jsModuleNative:[],jsModuleRuntime:[],wasmNative:[]},t.resources)),void 0!==t.environmentVariables&&(t.environmentVariables={...e.environmentVariables||{},...t.environmentVariables||{}}),void 0!==t.runtimeOptions&&t.runtimeOptions!==e.runtimeOptions&&(t.runtimeOptions=[...e.runtimeOptions||[],...t.runtimeOptions||[]]),Object.assign(e,t)}function ve(e,o){if(e===o)return e;const t={...o};return t.config&&(e.config||(e.config={}),t.config=ye(e.config,t.config)),Object.assign(e,t)}function _e(e,o){if(e===o)return e;const t={...o};return void 0!==t.coreAssembly&&(t.coreAssembly=[...e.coreAssembly||[],...t.coreAssembly||[]]),void 0!==t.assembly&&(t.assembly=[...e.assembly||[],...t.assembly||[]]),void 0!==t.lazyAssembly&&(t.lazyAssembly=[...e.lazyAssembly||[],...t.lazyAssembly||[]]),void 0!==t.corePdb&&(t.corePdb=[...e.corePdb||[],...t.corePdb||[]]),void 0!==t.pdb&&(t.pdb=[...e.pdb||[],...t.pdb||[]]),void 0!==t.jsModuleWorker&&(t.jsModuleWorker=[...e.jsModuleWorker||[],...t.jsModuleWorker||[]]),void 0!==t.jsModuleNative&&(t.jsModuleNative=[...e.jsModuleNative||[],...t.jsModuleNative||[]]),void 0!==t.jsModuleDiagnostics&&(t.jsModuleDiagnostics=[...e.jsModuleDiagnostics||[],...t.jsModuleDiagnostics||[]]),void 0!==t.jsModuleRuntime&&(t.jsModuleRuntime=[...e.jsModuleRuntime||[],...t.jsModuleRuntime||[]]),void 0!==t.wasmSymbols&&(t.wasmSymbols=[...e.wasmSymbols||[],...t.wasmSymbols||[]]),void 0!==t.wasmNative&&(t.wasmNative=[...e.wasmNative||[],...t.wasmNative||[]]),void 0!==t.icu&&(t.icu=[...e.icu||[],...t.icu||[]]),void 0!==t.satelliteResources&&(t.satelliteResources=function(e,o){if(e===o)return e;for(const t in o)e[t]=[...e[t]||[],...o[t]||[]];return e}(e.satelliteResources||{},t.satelliteResources||{})),void 0!==t.modulesAfterConfigLoaded&&(t.modulesAfterConfigLoaded=[...e.modulesAfterConfigLoaded||[],...t.modulesAfterConfigLoaded||[]]),void 0!==t.modulesAfterRuntimeReady&&(t.modulesAfterRuntimeReady=[...e.modulesAfterRuntimeReady||[],...t.modulesAfterRuntimeReady||[]]),void 0!==t.extensions&&(t.extensions={...e.extensions||{},...t.extensions||{}}),void 0!==t.vfs&&(t.vfs=[...e.vfs||[],...t.vfs||[]]),Object.assign(e,t)}function Ee(){const e=Pe.config;if(e.environmentVariables=e.environmentVariables||{},e.runtimeOptions=e.runtimeOptions||[],e.resources=e.resources||{assembly:[],jsModuleNative:[],jsModuleWorker:[],jsModuleRuntime:[],wasmNative:[],vfs:[],satelliteResources:{}},e.assets){Pe.diagnosticTracing&&b("config.assets is deprecated, use config.resources instead");for(const o of e.assets){const t={};switch(o.behavior){case"assembly":t.assembly=[o];break;case"pdb":t.pdb=[o];break;case"resource":t.satelliteResources={},t.satelliteResources[o.culture]=[o];break;case"icu":t.icu=[o];break;case"symbols":t.wasmSymbols=[o];break;case"vfs":t.vfs=[o];break;case"dotnetwasm":t.wasmNative=[o];break;case"js-module-threads":t.jsModuleWorker=[o];break;case"js-module-runtime":t.jsModuleRuntime=[o];break;case"js-module-native":t.jsModuleNative=[o];break;case"js-module-diagnostics":t.jsModuleDiagnostics=[o];break;case"js-module-dotnet":break;default:throw new Error(`Unexpected behavior ${o.behavior} of asset ${o.name}`)}_e(e.resources,t)}}e.debugLevel,void 0===e.virtualWorkingDirectory&&(e.virtualWorkingDirectory=Ie),e.applicationEnvironment||(e.applicationEnvironment="Production"),e.applicationCulture&&(e.environmentVariables.LANG=`${e.applicationCulture}.UTF-8`),Oe.diagnosticTracing=Pe.diagnosticTracing=!!e.diagnosticTracing,Oe.waitForDebugger=e.waitForDebugger,Pe.maxParallelDownloads=e.maxParallelDownloads||Pe.maxParallelDownloads,Pe.enableDownloadRetry=void 0!==e.enableDownloadRetry?e.enableDownloadRetry:Pe.enableDownloadRetry}let Re=!1;async function je(e){var o;if(Re)return void await Pe.afterConfigLoaded.promise;let t;try{if(e.configSrc||Pe.config&&0!==Object.keys(Pe.config).length&&(Pe.config.assets||Pe.config.resources)||(e.configSrc="dotnet.boot.js"),t=e.configSrc,Re=!0,t&&(Pe.diagnosticTracing&&b("mono_wasm_load_config"),await async function(e){const o=e.configSrc,t=Pe.locateFile(o);let n=null;void 0!==Pe.loadBootResource&&(n=Pe.loadBootResource("manifest",o,t,"","manifest"));let r,i=null;if(n)if("string"==typeof n)n.includes(".json")?(i=await s(C(n)),r=await xe(i)):r=(await import(C(n))).config;else{const e=await n;"function"==typeof e.json?(i=e,r=await xe(i)):r=e.config}else t.includes(".json")?(i=await s(le(t,"manifest")),r=await xe(i)):r=(await import(le(t,"manifest"))).config;function s(e){return Pe.fetch_like(e,{method:"GET",credentials:"include",cache:"no-cache"})}Pe.config.applicationEnvironment&&(r.applicationEnvironment=Pe.config.applicationEnvironment),ye(Pe.config,r)}(e)),Ee(),await he(null===(o=Pe.config.resources)||void 0===o?void 0:o.modulesAfterConfigLoaded),await be("onRuntimeConfigLoaded",[Pe.config]),e.onConfigLoaded)try{await e.onConfigLoaded(Pe.config,Le),Ee()}catch(e){throw _("onConfigLoaded() failed",e),e}Ee(),Pe.afterConfigLoaded.promise_control.resolve(Pe.config)}catch(o){const n=`Failed to load config file ${t} ${o} ${null==o?void 0:o.stack}`;throw Pe.config=e.config=Object.assign(Pe.config,{message:n,error:o,isError:!0}),Xe(1,new Error(n)),o}}function Te(){return!!globalThis.navigator&&(Pe.isChromium||Pe.isFirefox)}async function xe(e){const o=Pe.config,t=await e.json();o.applicationEnvironment||t.applicationEnvironment||(t.applicationEnvironment=e.headers.get("Blazor-Environment")||e.headers.get("DotNet-Environment")||void 0),t.environmentVariables||(t.environmentVariables={});const n=e.headers.get("DOTNET-MODIFIABLE-ASSEMBLIES");n&&(t.environmentVariables.DOTNET_MODIFIABLE_ASSEMBLIES=n);const r=e.headers.get("ASPNETCORE-BROWSER-TOOLS");return r&&(t.environmentVariables.__ASPNETCORE_BROWSER_TOOLS=r),t}"function"==typeof importScripts&&(globalThis.dotnetSidecar=!0);const Ae="object"==typeof process&&"object"==typeof process.versions&&"string"==typeof process.versions.node,De="function"==typeof importScripts,Se=De&&"undefined"!=typeof dotnetSidecar,Me=De&&!Se,ke="object"==typeof window||De&&!Ae,Ce=!ke&&!Ae,Ie="/";let Oe={},Pe={},Ue={},Le={},Ne={},$e=!1;const ze={},We={config:ze},Fe={mono:{},binding:{},internal:Ne,module:We,loaderHelpers:Pe,runtimeHelpers:Oe,diagnosticHelpers:Ue,api:Le};function Be(e,o){if(e)return;const t="Assert failed: "+("function"==typeof o?o():o),n=new Error(t);_(t,n),Oe.nativeAbort(n)}function Ve(){return void 0!==Pe.exitCode}function He(){return Oe.runtimeReady&&!Ve()}function Je(){Ve()&&Be(!1,`.NET runtime already exited with ${Pe.exitCode} ${Pe.exitReason}. You can use dotnet.runMain() which doesn't exit the runtime.`),Oe.runtimeReady||Be(!1,".NET runtime didn't start yet. Please call dotnet.create() first.")}function qe(){ke&&(globalThis.addEventListener("unhandledrejection",eo),globalThis.addEventListener("error",oo))}let Qe,Ge;function Ze(e){Ge&&Ge(e),Xe(e,Pe.exitReason)}function Ke(e){Qe&&Qe(e||Pe.exitReason),Xe(1,e||Pe.exitReason)}function Xe(e,o){var t;const n=o&&"object"==typeof o;e=n&&"number"==typeof o.status?o.status:void 0===e?-1:e;const r=n&&"string"==typeof o.message?o.message:""+o;(o=n?o:Oe.ExitStatus?function(e,o){const t=new Oe.ExitStatus(e);return t.message=o,t.toString=()=>o,t}(e,r):new Error("Exit with code "+e+" "+r)).status=e,o.message||(o.message=r);const i=""+(o.stack||(new Error).stack);try{Object.defineProperty(o,"stack",{get:()=>i})}catch(e){}const s=!!o.silent;if(o.silent=!0,Ve())Pe.diagnosticTracing&&b("mono_exit called after exit");else{try{We.onAbort==Ke&&(We.onAbort=Qe),We.onExit==Ze&&(We.onExit=Ge),ke&&(globalThis.removeEventListener("unhandledrejection",eo),globalThis.removeEventListener("error",oo)),Oe.runtimeReady?(Oe.jiterpreter_dump_stats&&Oe.jiterpreter_dump_stats(!1),0===e&&(null===(t=Pe.config)||void 0===t?void 0:t.interopCleanupOnExit)&&Oe.forceDisposeProxies(!0,!0)):(Pe.diagnosticTracing&&b(`abort_startup, reason: ${o}`),function(e){Pe.allDownloadsQueued.promise_control.reject(e),Pe.allDownloadsFinished.promise_control.reject(e),Pe.afterConfigLoaded.promise_control.reject(e),Pe.wasmCompilePromise.promise_control.reject(e),Pe.runtimeModuleLoaded.promise_control.reject(e),Oe.dotnetReady&&(Oe.dotnetReady.promise_control.reject(e),Oe.afterInstantiateWasm.promise_control.reject(e),Oe.afterPreRun.promise_control.reject(e),Oe.beforeOnRuntimeInitialized.promise_control.reject(e),Oe.afterOnRuntimeInitialized.promise_control.reject(e),Oe.afterPostRun.promise_control.reject(e))}(o))}catch(e){v("mono_exit A failed",e)}try{s||(function(e,o){if(0!==e&&o){const e=Oe.ExitStatus&&o instanceof Oe.ExitStatus?b:_;"string"==typeof o?e(o):(void 0===o.stack&&(o.stack=(new Error).stack+""),o.message?e(Oe.stringify_as_error_with_stack?Oe.stringify_as_error_with_stack(o.message+"\n"+o.stack):o.message+"\n"+o.stack):e(JSON.stringify(o)))}!Me&&Pe.config&&(Pe.config.logExitCode?Pe.config.forwardConsole?j("WASM EXIT "+e):y("WASM EXIT "+e):Pe.config.forwardConsole&&j())}(e,o),function(e){if(ke&&!Me&&Pe.config&&Pe.config.appendElementOnExit&&document){const o=document.createElement("label");o.id="tests_done",0!==e&&(o.style.background="red"),o.innerHTML=""+e,document.body.appendChild(o)}}(e))}catch(e){v("mono_exit B failed",e)}Pe.exitCode=e,Pe.exitReason||(Pe.exitReason=o),!Me&&Oe.runtimeReady&&We.runtimeKeepalivePop()}if(Pe.config&&Pe.config.asyncFlushOnExit&&0===e)throw(async()=>{try{await async function(){try{const e=await import(/*! webpackIgnore: true */"process"),o=e=>new Promise((o,t)=>{e.on("error",t),e.end("","utf8",o)}),t=o(e.stderr),n=o(e.stdout);let r;const i=new Promise(e=>{r=setTimeout(()=>e("timeout"),1e3)});await Promise.race([Promise.all([n,t]),i]),clearTimeout(r)}catch(e){_(`flushing std* streams failed: ${e}`)}}()}finally{Ye(e,o)}})(),o;Ye(e,o)}function Ye(e,o){if(Oe.runtimeReady&&Oe.nativeExit)try{Oe.nativeExit(e)}catch(e){!Oe.ExitStatus||e instanceof Oe.ExitStatus||v("set_exit_code_and_quit_now failed: "+e.toString())}if(0!==e||!ke)throw Ae?process.exit(e):Oe.quit&&Oe.quit(e,o),o}function eo(e){to(e,e.reason,"rejection")}function oo(e){to(e,e.error,"error")}function to(e,o,t){e.preventDefault();try{o||(o=new Error("Unhandled "+t)),void 0===o.stack&&(o.stack=(new Error).stack),o.stack=o.stack+"",o.silent||(_("Unhandled error:",o),Xe(1,o))}catch(e){}}!function(n){if($e)throw new Error("Loader module already loaded");$e=!0,Oe=n.runtimeHelpers,Pe=n.loaderHelpers,Ue=n.diagnosticHelpers,Le=n.api,Ne=n.internal,Object.assign(Le,{INTERNAL:Ne,invokeLibraryInitializers:be}),Object.assign(n.module,{config:ye(ze,{environmentVariables:{}})});const a={mono_wasm_bindings_is_ready:!1,config:n.module.config,diagnosticTracing:!1,nativeAbort:e=>{throw e||new Error("abort")},nativeExit:e=>{throw new Error("exit:"+e)}},l={gitHash:"803eb28628f5623c108f1bf33504c86e19815821",config:n.module.config,diagnosticTracing:!1,maxParallelDownloads:16,enableDownloadRetry:!0,_loaded_files:[],loadedFiles:[],loadedAssemblies:[],libraryInitializers:[],workerNextNumber:1,actual_downloaded_assets_count:0,actual_instantiated_assets_count:0,expected_downloaded_assets_count:0,expected_instantiated_assets_count:0,afterConfigLoaded:r(),allDownloadsQueued:r(),allDownloadsFinished:r(),wasmCompilePromise:r(),runtimeModuleLoaded:r(),loadingWorkers:r(),is_exited:Ve,is_runtime_running:He,assert_runtime_running:Je,mono_exit:Xe,createPromiseController:r,getPromiseController:i,assertIsControllablePromise:s,mono_download_assets:oe,resolve_single_asset_path:Y,setup_proxy_console:R,set_thread_prefix:h,installUnhandledErrorHandler:qe,retrieve_asset_download:re,invokeLibraryInitializers:be,isDebuggingSupported:Te,exceptions:e,simd:t,relaxedSimd:o};Object.assign(Oe,a),Object.assign(Pe,l)}(Fe);let no,ro,io,so=!1,ao=!1;async function lo(e){if(!ao){if(ao=!0,ke&&Pe.config.forwardConsole&&void 0!==globalThis.WebSocket&&R("main",globalThis.console,globalThis.location.origin),We||Be(!1,"Null moduleConfig"),Pe.config||Be(!1,"Null moduleConfig.config"),"function"==typeof e){const o=e(Fe.api);if(o.ready)throw new Error("Module.ready couldn't be redefined.");Object.assign(We,o),ve(We,o)}else{if("object"!=typeof e)throw new Error("Can't use moduleFactory callback of createDotnetRuntime function.");ve(We,e)}await async function(e){if(Ae){const e=await import(/*! webpackIgnore: true */"process"),o=14;if(e.versions.node.split(".")[0]<o)throw new Error(`NodeJS at '${e.execPath}' has too low version '${e.versions.node}', please use at least ${o}.`)}const o=/*! webpackIgnore: true */import.meta.url,t=o.indexOf("?");var n;if(t>0&&(Pe.modulesUniqueQuery=o.substring(t)),Pe.scriptUrl=o.replace(/\\/g,"/").replace(/[?#].*/,""),Pe.scriptDirectory=(n=Pe.scriptUrl).slice(0,n.lastIndexOf("/"))+"/",Pe.locateFile=e=>"URL"in globalThis&&globalThis.URL!==M?new URL(e,Pe.scriptDirectory).toString():P(e)?e:Pe.scriptDirectory+e,Pe.fetch_like=k,Pe.out=console.log,Pe.err=console.error,Pe.onDownloadResourceProgress=e.onDownloadResourceProgress,ke&&globalThis.navigator){const e=globalThis.navigator,o=e.userAgentData&&e.userAgentData.brands;o&&o.length>0?Pe.isChromium=o.some(e=>"Google Chrome"===e.brand||"Microsoft Edge"===e.brand||"Chromium"===e.brand):e.userAgent&&(Pe.isChromium=e.userAgent.includes("Chrome"),Pe.isFirefox=e.userAgent.includes("Firefox"))}void 0===globalThis.URL&&(globalThis.URL=M)}(We)}}async function co(e){return await lo(e),Pe.config.exitOnUnhandledError&&qe(),Qe=We.onAbort,Ge=We.onExit,We.onAbort=Ke,We.onExit=Ze,We.ENVIRONMENT_IS_PTHREAD?async function(){(function(){const e=new MessageChannel,o=e.port1,t=e.port2;o.addEventListener("message",e=>{var n,r;n=JSON.parse(e.data.config),r=JSON.parse(e.data.monoThreadInfo),so?Pe.diagnosticTracing&&b("mono config already received"):(ye(Pe.config,n),Oe.monoThreadInfo=r,Ee(),Pe.diagnosticTracing&&b("mono config received"),so=!0,Pe.afterConfigLoaded.promise_control.resolve(Pe.config),ke&&n.forwardConsole&&void 0!==globalThis.WebSocket&&Pe.setup_proxy_console("worker-idle",console,globalThis.location.origin)),o.close(),t.close()},{once:!0}),o.start(),self.postMessage({[a]:{monoCmd:"preload",port:t}},[t])})(),await Pe.afterConfigLoaded.promise,function(){const e=Pe.config;e.assets||Be(!1,"config.assets must be defined");for(const o of e.assets)K(o),Q[o.behavior]&&$.push(o)}(),setTimeout(async()=>{try{await oe()}catch(e){Xe(1,e)}},0);const e=uo(),o=await Promise.all(e);return await fo(o),We}():async function(){var e;await je(We),ne();const o=uo();(async function(){try{const e=Y("dotnetwasm");await ie(e),e&&e.pendingDownloadInternal&&e.pendingDownloadInternal.response||Be(!1,"Can't load dotnet.native.wasm");const o=await e.pendingDownloadInternal.response,t=o.headers&&o.headers.get?o.headers.get("Content-Type"):void 0;let n;if("function"==typeof WebAssembly.compileStreaming&&"application/wasm"===t)n=await WebAssembly.compileStreaming(o);else{ke&&"application/wasm"!==t&&v('WebAssembly resource does not have the expected content type "application/wasm", so falling back to slower ArrayBuffer instantiation.');const e=await o.arrayBuffer();Pe.diagnosticTracing&&b("instantiate_wasm_module buffered"),n=Ce?await Promise.resolve(new WebAssembly.Module(e)):await WebAssembly.compile(e)}e.pendingDownloadInternal=null,e.pendingDownload=null,e.buffer=null,e.moduleExports=null,Pe.wasmCompilePromise.promise_control.resolve(n)}catch(e){Pe.wasmCompilePromise.promise_control.reject(e)}})(),setTimeout(async()=>{try{D(),await oe()}catch(e){Xe(1,e)}},0);const t=await Promise.all(o);return await fo(t),await Oe.dotnetReady.promise,await he(null===(e=Pe.config.resources)||void 0===e?void 0:e.modulesAfterRuntimeReady),await be("onRuntimeReady",[Fe.api]),Le}()}function uo(){const e=Y("js-module-runtime"),o=Y("js-module-native");if(no&&ro)return[no,ro,io];"object"==typeof e.moduleExports?no=e.moduleExports:(Pe.diagnosticTracing&&b(`Attempting to import '${e.resolvedUrl}' for ${e.name}`),no=import(/*! webpackIgnore: true */e.resolvedUrl)),"object"==typeof o.moduleExports?ro=o.moduleExports:(Pe.diagnosticTracing&&b(`Attempting to import '${o.resolvedUrl}' for ${o.name}`),ro=import(/*! webpackIgnore: true */o.resolvedUrl));const t=X("js-module-diagnostics");return t&&("object"==typeof t.moduleExports?io=t.moduleExports:(Pe.diagnosticTracing&&b(`Attempting to import '${t.resolvedUrl}' for ${t.name}`),io=import(/*! webpackIgnore: true */t.resolvedUrl))),[no,ro,io]}async function fo(e){const{initializeExports:o,initializeReplacements:t,configureRuntimeStartup:n,configureEmscriptenStartup:r,configureWorkerStartup:i,setRuntimeGlobals:s,passEmscriptenInternals:a}=e[0],{default:l}=e[1],c=e[2];s(Fe),o(Fe),c&&c.setRuntimeGlobals(Fe),await n(We),Pe.runtimeModuleLoaded.promise_control.resolve(),l(()=>(Object.assign(We,{__dotnet_runtime:{initializeReplacements:t,configureEmscriptenStartup:r,configureWorkerStartup:i,passEmscriptenInternals:a}}),We)).catch(e=>{if(e.message&&e.message.toLowerCase().includes("out of memory"))throw new Error(".NET runtime has failed to start, because too much memory was requested. Please decrease the memory by adjusting EmccMaximumHeapSize.");throw e})}const mo=new class{withModuleConfig(e){try{return ve(We,e),this}catch(e){throw Xe(1,e),e}}withInterpreterPgo(e,o){try{return ye(ze,{interpreterPgo:e,interpreterPgoSaveDelay:o}),ze.runtimeOptions?ze.runtimeOptions.push("--interp-pgo-recording"):ze.runtimeOptions=["--interp-pgo-recording"],this}catch(e){throw Xe(1,e),e}}withConfig(e){try{return ye(ze,e),this}catch(e){throw Xe(1,e),e}}withConfigSrc(e){try{return e&&"string"==typeof e||Be(!1,"must be file path or URL"),ve(We,{configSrc:e}),this}catch(e){throw Xe(1,e),e}}withVirtualWorkingDirectory(e){try{return e&&"string"==typeof e||Be(!1,"must be directory path"),ye(ze,{virtualWorkingDirectory:e}),this}catch(e){throw Xe(1,e),e}}withEnvironmentVariable(e,o){try{const t={};return t[e]=o,ye(ze,{environmentVariables:t}),this}catch(e){throw Xe(1,e),e}}withEnvironmentVariables(e){try{return e&&"object"==typeof e||Be(!1,"must be dictionary object"),ye(ze,{environmentVariables:e}),this}catch(e){throw Xe(1,e),e}}withDiagnosticTracing(e){try{return"boolean"!=typeof e&&Be(!1,"must be boolean"),ye(ze,{diagnosticTracing:e}),this}catch(e){throw Xe(1,e),e}}withDebugging(e){try{return null!=e&&"number"==typeof e||Be(!1,"must be number"),ye(ze,{debugLevel:e}),this}catch(e){throw Xe(1,e),e}}withApplicationArguments(...e){try{return e&&Array.isArray(e)||Be(!1,"must be array of strings"),ye(ze,{applicationArguments:e}),this}catch(e){throw Xe(1,e),e}}withRuntimeOptions(e){try{return e&&Array.isArray(e)||Be(!1,"must be array of strings"),ze.runtimeOptions?ze.runtimeOptions.push(...e):ze.runtimeOptions=e,this}catch(e){throw Xe(1,e),e}}withMainAssembly(e){try{return ye(ze,{mainAssemblyName:e}),this}catch(e){throw Xe(1,e),e}}withApplicationArgumentsFromQuery(){try{if(!globalThis.window)throw new Error("Missing window to the query parameters from");if(void 0===globalThis.URLSearchParams)throw new Error("URLSearchParams is supported");const e=new URLSearchParams(globalThis.window.location.search).getAll("arg");return this.withApplicationArguments(...e)}catch(e){throw Xe(1,e),e}}withApplicationEnvironment(e){try{return ye(ze,{applicationEnvironment:e}),this}catch(e){throw Xe(1,e),e}}withApplicationCulture(e){try{return ye(ze,{applicationCulture:e}),this}catch(e){throw Xe(1,e),e}}withResourceLoader(e){try{return Pe.loadBootResource=e,this}catch(e){throw Xe(1,e),e}}async download(){try{await async function(){lo(We),await je(We),ne(),D(),oe(),await Pe.allDownloadsFinished.promise}()}catch(e){throw Xe(1,e),e}}async create(){try{return this.instance||(this.instance=await async function(){return await co(We),Fe.api}()),this.instance}catch(e){throw Xe(1,e),e}}run(){return this.runMainAndExit()}async runMainAndExit(){try{return We.config||Be(!1,"Null moduleConfig.config"),this.instance||await this.create(),this.instance.runMainAndExit()}catch(e){throw Xe(1,e),e}}async runMain(){try{return We.config||Be(!1,"Null moduleConfig.config"),this.instance||await this.create(),this.instance.runMain()}catch(e){throw Xe(1,e),e}}},go=Xe,po=co;Ce||"function"==typeof globalThis.URL||Be(!1,"This browser/engine doesn't support URL API. Please use a modern version."),"function"!=typeof globalThis.BigInt64Array&&Be(!1,"This browser/engine doesn't support BigInt64Array API. Please use a modern version. See also https://learn.microsoft.com/aspnet/core/blazor/supported-platforms"),globalThis.performance&&"function"==typeof globalThis.performance.now||Be(!1,"This browser/engine doesn't support performance.now. Please use a modern version."),Ce||globalThis.crypto&&"object"==typeof globalThis.crypto.subtle||Be(!1,"This engine doesn't support crypto.subtle. Please use a modern version."),Ce||globalThis.crypto&&"function"==typeof globalThis.crypto.getRandomValues||Be(!1,"This engine doesn't support crypto.getRandomValues. Please use a modern version."),Ae&&"function"!=typeof process.exit&&Be(!1,"This engine doesn't support process.exit. Please use a modern version."),mo.withConfig(/*json-start*/{
  "mainAssemblyName": "Uno.Gallery",
  "resources": {
    "hash": "sha256-+3TPMXe3ARBNShuJEDBZ+F7xOm7RCQcXoGArooyeMlI=",
    "jsModuleNative": [
      {
        "name": "dotnet.native.0f3hpw8i37.js"
      }
    ],
    "jsModuleRuntime": [
      {
        "name": "dotnet.runtime.cim5h1exkd.js"
      }
    ],
    "wasmNative": [
      {
        "name": "dotnet.native.gf2mxi3un1.wasm",
        "hash": "sha256-NFGvHEGRD+bH6ouBC2r/kZQ/Siy+8GI7dsObgEdYlJU=",
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
        "name": "System.Runtime.InteropServices.JavaScript.dtpr0ioca2.wasm",
        "hash": "sha256-jzzGRrWYq97q8h9tVjHI3U2/qsR8kR0XpIqRGbOZM7A=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Private.CoreLib.wasm",
        "name": "System.Private.CoreLib.zr43hhyjtw.wasm",
        "hash": "sha256-768mLiLV/cVPCgvtp5En9eVCpBxLtuivFXZjon5gIcA=",
        "cache": "force-cache"
      }
    ],
    "assembly": [
      {
        "virtualPath": "CommonServiceLocator.wasm",
        "name": "CommonServiceLocator.kx5c3xe0qn.wasm",
        "hash": "sha256-+G+Cu0EcZZHrsmlYdeZkH/gqqd8dM2+kBzu07k7S5NY=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "ExCSS.wasm",
        "name": "ExCSS.pv7vmb4542.wasm",
        "hash": "sha256-pZveXW010vskf//UBqHhWUZqWSA8LaCelcFDnLAT0D4=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "HarfBuzzSharp.wasm",
        "name": "HarfBuzzSharp.l663tr1rol.wasm",
        "hash": "sha256-82TLByS31Daj9cnaXFSOKBL8Lafqq23SLg0nnhBi/9U=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.Bcl.AsyncInterfaces.wasm",
        "name": "Microsoft.Bcl.AsyncInterfaces.7qhkqn7mvn.wasm",
        "hash": "sha256-v5yr8rV7YJtgeH3lNmpZTYAajvMNLrok8lDnDlarvog=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.Extensions.Configuration.wasm",
        "name": "Microsoft.Extensions.Configuration.0di5eoa1ym.wasm",
        "hash": "sha256-NPooPFMsit1guJMuI4Q/ChegWgAl2EuPmcQg31HfOec=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.Extensions.Configuration.Abstractions.wasm",
        "name": "Microsoft.Extensions.Configuration.Abstractions.ql8h0aihfy.wasm",
        "hash": "sha256-zg0PVZuml2pQObImM3VOshkvAj/vmJnug8CSlMag3+A=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.Extensions.Configuration.Binder.wasm",
        "name": "Microsoft.Extensions.Configuration.Binder.869fhx15vj.wasm",
        "hash": "sha256-MAFPYzya2fJBMfFI0D7MywZbaiCFrqCsog4eLxdLPiI=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.Extensions.DependencyInjection.wasm",
        "name": "Microsoft.Extensions.DependencyInjection.uk97zwuzyh.wasm",
        "hash": "sha256-wrCIwxUgNqPCd0hML4tTRAhDMfGCef7gY3r4LeiYR3g=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.Extensions.DependencyInjection.Abstractions.wasm",
        "name": "Microsoft.Extensions.DependencyInjection.Abstractions.uwe16cvcri.wasm",
        "hash": "sha256-vmdbq3uWzjJiJ2wP3x7VrgpG2pPkWllflnRZKuQvZaI=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.Extensions.Logging.wasm",
        "name": "Microsoft.Extensions.Logging.zhbn7lqruh.wasm",
        "hash": "sha256-CSvCPDqf1pi+QRsyLgnKsO5CId7hAwjxh008+e3rulE=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.Extensions.Logging.Abstractions.wasm",
        "name": "Microsoft.Extensions.Logging.Abstractions.2xl55jpi71.wasm",
        "hash": "sha256-yqC9kVWYgDy3S6E+3P8eUhefDpRUxjPb4QOQtEVSKWU=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.Extensions.Logging.Configuration.wasm",
        "name": "Microsoft.Extensions.Logging.Configuration.w1vptpkpis.wasm",
        "hash": "sha256-jNXoY4s6qKrZErxXtaUGIIqgNTnEKTKbpfr2Gyvy388=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.Extensions.Logging.Console.wasm",
        "name": "Microsoft.Extensions.Logging.Console.kh5l2jforu.wasm",
        "hash": "sha256-+JKYq02DAhmI+XCoaVfjpbUCk7PlH6nM0BPhneG7Two=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.Extensions.Logging.Debug.wasm",
        "name": "Microsoft.Extensions.Logging.Debug.87u2iod921.wasm",
        "hash": "sha256-ZMdomY62OnoNRFi40B58InYDG8qxlRfswnzn0M0am6I=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.Extensions.ObjectPool.wasm",
        "name": "Microsoft.Extensions.ObjectPool.acben93awn.wasm",
        "hash": "sha256-6htP1FXyxaIjgfIPG2KyI6CDSQrvmR+xN86LaF1mo5c=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.Extensions.Options.wasm",
        "name": "Microsoft.Extensions.Options.rw41kcrg5t.wasm",
        "hash": "sha256-G8NURw7294pAuzW8/ydERtHrk+KGpHsWOtDjyb7PpY4=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.Extensions.Options.ConfigurationExtensions.wasm",
        "name": "Microsoft.Extensions.Options.ConfigurationExtensions.5t4zum1i0h.wasm",
        "hash": "sha256-GYnHNKY8dgQtxZW4+nT5It4uk8MSnLKkaAH9LubGwYE=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.Extensions.Primitives.wasm",
        "name": "Microsoft.Extensions.Primitives.9vi6axzq9m.wasm",
        "hash": "sha256-BcPGhDpKYa8a2kQ7QPetB7sTYqEFa3ZoZJv9hD99F0I=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.Win32.Registry.AccessControl.wasm",
        "name": "Microsoft.Win32.Registry.AccessControl.zmyqpwdir4.wasm",
        "hash": "sha256-27rH67SyypctrRCbBSEHDka5HO2dCZhUGAOYsB9uez4=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.Win32.SystemEvents.wasm",
        "name": "Microsoft.Win32.SystemEvents.z5zwergrqy.wasm",
        "hash": "sha256-+auu5HBtxqvtanP4X88cHxvG2IhKRnqXISeEG/LwfBk=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "ShimSkiaSharp.wasm",
        "name": "ShimSkiaSharp.9ohxr4v21y.wasm",
        "hash": "sha256-udKuQsstXXwcnSUqE4vP7YY39xyVSYffYeRpc9dHM6I=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "SkiaSharp.wasm",
        "name": "SkiaSharp.jtp1hfw1z8.wasm",
        "hash": "sha256-98Vn+X3FOBtmqddORwCtI2+nAjG8na3lLT90j6233Cc=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "SkiaSharp.Resources.wasm",
        "name": "SkiaSharp.Resources.ccqgbr7dyl.wasm",
        "hash": "sha256-pC8CQ+e0jQbDj3RkuUon314VO2mTWwmx7PhCHz8n3BU=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "SkiaSharp.SceneGraph.wasm",
        "name": "SkiaSharp.SceneGraph.5tzymyix1g.wasm",
        "hash": "sha256-NxizyxFieSrBuzuNMMgV7NERFC4D9Ki45eTynakyLAo=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "SkiaSharp.Skottie.wasm",
        "name": "SkiaSharp.Skottie.lym0g9g1tj.wasm",
        "hash": "sha256-w3etosrUdPyCWbG1otwCA5/UASfiqG+3SRzzVyg3Juc=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Svg.Custom.wasm",
        "name": "Svg.Custom.f9fllof8df.wasm",
        "hash": "sha256-g8WVFYvnftBGg0hAI8uFeNiChvJlOlc4iUZQGH5nkyM=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Svg.Model.wasm",
        "name": "Svg.Model.ce1ild1lj5.wasm",
        "hash": "sha256-bE8tukPwgOfVVUhpwC5/RaCQCadqHUtXjmADxBBfP/Y=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Svg.Skia.wasm",
        "name": "Svg.Skia.r6blwzhku5.wasm",
        "hash": "sha256-HTi57bGa7IKBtI5Txbq3W7iEL+t6ku4b9OKPtAbWXy0=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.CodeDom.wasm",
        "name": "System.CodeDom.1nzvmkpkj5.wasm",
        "hash": "sha256-0wPEWL4DhtuQm5VWeSF1HgihUTrysf3vNWdQVxJleDk=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.ComponentModel.Composition.wasm",
        "name": "System.ComponentModel.Composition.efyt51ibpe.wasm",
        "hash": "sha256-ivyctymxaH0C2RMhThi+sS2Lci7tt9pmLE5RxrCqcVw=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.ComponentModel.Composition.Registration.wasm",
        "name": "System.ComponentModel.Composition.Registration.zm1tiuzzjx.wasm",
        "hash": "sha256-ddhlM1VyNDrzAgi6J10iUgBXEcggS1232vHGsEt7+vk=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Configuration.ConfigurationManager.wasm",
        "name": "System.Configuration.ConfigurationManager.qyf0ioe0ed.wasm",
        "hash": "sha256-Lh1uZ8MPoAmmGtiljdEt33/j/upQ7f3b85UpoahdGVU=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Data.Odbc.wasm",
        "name": "System.Data.Odbc.tqhlpl1q9g.wasm",
        "hash": "sha256-6/WVO9JwqI6P7q7/G/a4dzVAhsXa/rPelKGNNjhgM6w=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Data.OleDb.wasm",
        "name": "System.Data.OleDb.5xn7p0859j.wasm",
        "hash": "sha256-2e1Kzim2dytcpvtFFSY/DM1o7cFfs/nCWzMA8Of173g=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Data.SqlClient.wasm",
        "name": "System.Data.SqlClient.53hptp393f.wasm",
        "hash": "sha256-PyyAoFfJXsSLydPgQRQkU2kgX6sF9P3NNKX+ZwK9XmM=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Diagnostics.EventLog.wasm",
        "name": "System.Diagnostics.EventLog.9nlbrhofh0.wasm",
        "hash": "sha256-q55+rpQVvcS3tJkiJCF3tgTsZNgksY1x/M1NJon9Ylk=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Diagnostics.PerformanceCounter.wasm",
        "name": "System.Diagnostics.PerformanceCounter.b571tublwv.wasm",
        "hash": "sha256-kcCLpuW3I2mPxpKpHSLynmizVyMGvaU3ea/nyQulJnQ=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.DirectoryServices.wasm",
        "name": "System.DirectoryServices.u4isot54s1.wasm",
        "hash": "sha256-zkY00K38qcE5HpziQR/urQ7H17Zxc8rGrval74OnzF0=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.DirectoryServices.AccountManagement.wasm",
        "name": "System.DirectoryServices.AccountManagement.2cy2svpzse.wasm",
        "hash": "sha256-rh0nTW6orC+zyxw8Kvrw6VZO6ZEW1qcmy4WgnqW2pok=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.DirectoryServices.Protocols.wasm",
        "name": "System.DirectoryServices.Protocols.73twi7pljj.wasm",
        "hash": "sha256-vQb+vhBOSuSNghSv9wZUaVlK8CrE5d/VT1l6cNU7oXU=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Drawing.Common.wasm",
        "name": "System.Drawing.Common.ev7xuj3ne2.wasm",
        "hash": "sha256-5l8iu/MWYMvjyYo4uuV5rMM1I3uLrh/d/IKbW5OjKYc=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Private.Windows.Core.wasm",
        "name": "System.Private.Windows.Core.0iyenvq7zi.wasm",
        "hash": "sha256-2KY37WWECd78Z3wO4OlQLzpj2CJA1nFQvzsP+Oj4CcA=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.IO.Packaging.wasm",
        "name": "System.IO.Packaging.6p2x07se6x.wasm",
        "hash": "sha256-FrjG2UrRyWyKXFKGSWnR5vfJX9uYEJADqN5lNxIiAik=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.IO.Ports.wasm",
        "name": "System.IO.Ports.7y1ygjf2eh.wasm",
        "hash": "sha256-X+qsCeX4EK5F3dTAJxa4oigFN2nkpV0JNZ0UQbA7upY=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Json.wasm",
        "name": "System.Json.8wdegv5g2v.wasm",
        "hash": "sha256-2HnbF9hfRF8LwzxibHK8mxkzjlfqbPlTl3nKD2YvKfw=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Management.wasm",
        "name": "System.Management.ix1xd0mi5t.wasm",
        "hash": "sha256-+mr2YjaXJ67UB9vjnju6wxwGx+HmUnjLFKAN9aLosIk=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Private.ServiceModel.wasm",
        "name": "System.Private.ServiceModel.ldo714lv8s.wasm",
        "hash": "sha256-Kbg3EAUui5FB7jRq6jVd/CSUppD1s3RVS6QE789Sxj4=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Reflection.Context.wasm",
        "name": "System.Reflection.Context.z7ohz2wgs0.wasm",
        "hash": "sha256-ISA7yLGWpbCTNYqBASJjMSgEq/WzcQRAudCvsEq/aO4=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Runtime.Caching.wasm",
        "name": "System.Runtime.Caching.owra9xjir9.wasm",
        "hash": "sha256-yCjLXIdodS4juxFEKFMV6ZNeD0EuIDFEOSbJACn38gU=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Security.Cryptography.Pkcs.wasm",
        "name": "System.Security.Cryptography.Pkcs.0rhaass8ti.wasm",
        "hash": "sha256-XHK+QwbS1w1r58V15GT994k49aQxu7ZdmDeMgPmPoLU=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Security.Cryptography.ProtectedData.wasm",
        "name": "System.Security.Cryptography.ProtectedData.p0032uqvmn.wasm",
        "hash": "sha256-2fzHek+ooepgCDG7uzHy9K3zo960EFGqI8UEbC9teiI=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Security.Cryptography.Xml.wasm",
        "name": "System.Security.Cryptography.Xml.m1pix0cjp3.wasm",
        "hash": "sha256-tm+M5xoF4Pn+tNWzwXflpdinqUabryHFkF5XKkq4fjQ=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Security.Permissions.wasm",
        "name": "System.Security.Permissions.87s22zuvw3.wasm",
        "hash": "sha256-REnz3bl3yb1ZPyzA4uYoY0yCT6nC7trrQ6JE1bF/zeM=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.ServiceModel.Duplex.wasm",
        "name": "System.ServiceModel.Duplex.9jbv2xz71u.wasm",
        "hash": "sha256-JaJ0ihnA3f1ElteJV1uh7puK5hq8FtR7JFmIN3txV18=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.ServiceModel.Http.wasm",
        "name": "System.ServiceModel.Http.vo14inqsd7.wasm",
        "hash": "sha256-cXC7/Sgh4U+q0HsmZefxHpLE0SVp9C4ukIBjhDPlsXY=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.ServiceModel.NetTcp.wasm",
        "name": "System.ServiceModel.NetTcp.31bdcxsl5l.wasm",
        "hash": "sha256-6dbpluGdyH3Gh89lBN2kpjDFZPqG0YPNuK7NAwKzVUw=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.ServiceModel.Primitives.wasm",
        "name": "System.ServiceModel.Primitives.52m1mxlwkf.wasm",
        "hash": "sha256-7W8oyNLM0iRrYkSDV3g9UyqKUOP4dzxAdXTZyl3Xkqc=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.ServiceModel.wasm",
        "name": "System.ServiceModel.7m2abdqsma.wasm",
        "hash": "sha256-vwpgfjzFErIH8Uu2Eap4VLnFatnrz1jSbfiwqagno3E=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.ServiceModel.Security.wasm",
        "name": "System.ServiceModel.Security.stn905pfjm.wasm",
        "hash": "sha256-4GS1R2NFEG43NiheXmtKI4cHn7XXRTVyjeUnLB85ms4=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.ServiceModel.Syndication.wasm",
        "name": "System.ServiceModel.Syndication.o6waxx2niw.wasm",
        "hash": "sha256-cIaM923Kjy0FKHN5E5oOKRHJvtM/6mmWpNgfjXootBk=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.ServiceProcess.ServiceController.wasm",
        "name": "System.ServiceProcess.ServiceController.107mybqmrt.wasm",
        "hash": "sha256-D6VzsFFfMyDyvjwoJze3z7FDzjAl9tcd/TDDDspuCOU=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Speech.wasm",
        "name": "System.Speech.iiurs5vn29.wasm",
        "hash": "sha256-xqzIj3MYcxeg5sKycpvaWgaWVTSAOO8ZR46GP3lf6UQ=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Web.Services.Description.wasm",
        "name": "System.Web.Services.Description.d35oh7yf3f.wasm",
        "hash": "sha256-N8NL0JVaKBr7I46SlwjxnBUkyP8PCU0lkv/k6y/o5hc=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Windows.Extensions.wasm",
        "name": "System.Windows.Extensions.dsy63mddvz.wasm",
        "hash": "sha256-nQDEiNPRgdUf4pEvjheQLLPRWZ8ciNa5L1ZCSdh4958=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "ColorCode.Core.wasm",
        "name": "ColorCode.Core.x2fgny7a18.wasm",
        "hash": "sha256-pyCkyj8gtoushTisQLYGhHpRvbBITmH9YmEPrB7/9BE=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "ColorCode.WinUI.wasm",
        "name": "ColorCode.WinUI.leszponxuk.wasm",
        "hash": "sha256-jUO4yf8/Qo0WoY9uRWn25Z7v429ghVhrSwybCxe81OU=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "CommunityToolkit.Common.wasm",
        "name": "CommunityToolkit.Common.r7v99ygdoh.wasm",
        "hash": "sha256-uUhCJDlwPAayFYgBq8mSnbPocWvWw2uz9NNraSK94Ks=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "CommunityToolkit.WinUI.wasm",
        "name": "CommunityToolkit.WinUI.do3w89vg0w.wasm",
        "hash": "sha256-nZZKU/q+/5M2o9y7N0kNQVok7pF3MNvZrVUc9HwJ1Ho=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "CommunityToolkit.WinUI.UI.wasm",
        "name": "CommunityToolkit.WinUI.UI.1akazj68fu.wasm",
        "hash": "sha256-KRSWPDPwNdU9NpEvOaP4prvJXDuEVqwTRxwsgJ3j1oo=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "CommunityToolkit.WinUI.UI.Controls.Core.wasm",
        "name": "CommunityToolkit.WinUI.UI.Controls.Core.8l0ujrlzfp.wasm",
        "hash": "sha256-fK2d+nBSfERSXKYisK8my/ym3rbVaR8vBji0dSZhvbU=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "CommunityToolkit.WinUI.UI.Controls.DataGrid.wasm",
        "name": "CommunityToolkit.WinUI.UI.Controls.DataGrid.34ksn4iynz.wasm",
        "hash": "sha256-0/syky99d3x7Qo8YrW0vXtmwSQH+PEN2zYlXIrAZavY=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "CommunityToolkit.WinUI.UI.Controls.Input.wasm",
        "name": "CommunityToolkit.WinUI.UI.Controls.Input.ulaufezrkp.wasm",
        "hash": "sha256-zhetTStOxqjuia6S0TX1BSceu61P0qMHf+Ldv/bHEXs=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "CommunityToolkit.WinUI.UI.Controls.Layout.wasm",
        "name": "CommunityToolkit.WinUI.UI.Controls.Layout.8c0nt6ad4g.wasm",
        "hash": "sha256-iKmU9/35HjbPcr9upsUf2QVa8/y4ZSNl5afEswtBL8M=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "CommunityToolkit.WinUI.UI.Controls.Markdown.wasm",
        "name": "CommunityToolkit.WinUI.UI.Controls.Markdown.if2pfhgr04.wasm",
        "hash": "sha256-chRn1RuUcxeWNMIWriMI2SsXiz78+CiHW/dfYF8wrmE=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "CommunityToolkit.WinUI.UI.Controls.Media.wasm",
        "name": "CommunityToolkit.WinUI.UI.Controls.Media.so5wybxhl0.wasm",
        "hash": "sha256-zKJL5fVVgJkHVtQNbCH2GEAc8uAYHudFqpl7gy7aABc=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "CommunityToolkit.WinUI.UI.Controls.Primitives.wasm",
        "name": "CommunityToolkit.WinUI.UI.Controls.Primitives.3jbo8xeyjh.wasm",
        "hash": "sha256-oSMEkmgvRbbDg136a9I/3cX8W7K4O6MTpuPb7+GIxsU=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.Core.Extensions.wasm",
        "name": "Uno.Core.Extensions.51g9d4h0sd.wasm",
        "hash": "sha256-aYY+w3uhGGwXpj0aJcSL5t2OZ2d8ur8Hs4w2W5cqyHA=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.Core.Extensions.Collections.wasm",
        "name": "Uno.Core.Extensions.Collections.ruojs7v6me.wasm",
        "hash": "sha256-bXNDAUGCWgWXoFt1i7dm6nP1djVUKZqBOiUABDvI550=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.Core.Extensions.Compatibility.wasm",
        "name": "Uno.Core.Extensions.Compatibility.ttwo52p1rl.wasm",
        "hash": "sha256-zwZzgnL4hj7SaD1uuoGl5eUtAVvsl7H9MdopAkEx2D4=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.Core.Extensions.Disposables.wasm",
        "name": "Uno.Core.Extensions.Disposables.3zf3jiar39.wasm",
        "hash": "sha256-YbEoIb8wVVfyWKN9T+vaqo2UtwRv15u8JAFrYK+xOOg=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.Core.Extensions.Equality.wasm",
        "name": "Uno.Core.Extensions.Equality.ozgo1dzh83.wasm",
        "hash": "sha256-BNEKVFdPRiQDI5LcY0gxoGyynibTinR3mqdb9zTZWkk=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.Core.Extensions.Logging.wasm",
        "name": "Uno.Core.Extensions.Logging.mvhvou1dl0.wasm",
        "hash": "sha256-vvO18B9kRqGqLGGe8NGpfGdIwRGysrzmo2PiNi+Kfog=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.Core.Extensions.Logging.Singleton.wasm",
        "name": "Uno.Core.Extensions.Logging.Singleton.mtno6qf887.wasm",
        "hash": "sha256-ZhP4/Ct4+FvaqGNFivpEKBXEXHWIYe2B19QFMLr5Qas=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.Core.Extensions.Threading.wasm",
        "name": "Uno.Core.Extensions.Threading.rzs7rp0lve.wasm",
        "hash": "sha256-h83VH6DPp78+1yzazqsCG5OIeeot8aQS54KyJTQWN8Y=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.Cupertino.WinUI.wasm",
        "name": "Uno.Cupertino.WinUI.xnu69bna23.wasm",
        "hash": "sha256-vYWnnVzs+Kd1zhdPO5OWlw6o4mmum/usun1RG6rClT8=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.Diagnostics.Eventing.wasm",
        "name": "Uno.Diagnostics.Eventing.62qxdibsm3.wasm",
        "hash": "sha256-0phkcPmlhwv6dCvdUoLoNGL6ON6ViVnENl/JDA8KLHE=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.Extensions.Logging.WebAssembly.Console.wasm",
        "name": "Uno.Extensions.Logging.WebAssembly.Console.v5m1raxxfa.wasm",
        "hash": "sha256-c9lt45ar78dKKuHJiaiX7hBUvspio91gJMpZVTwfsvg=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.Fonts.Fluent.wasm",
        "name": "Uno.Fonts.Fluent.euk13ifi09.wasm",
        "hash": "sha256-OgUMuLQrnmXFD5uzoMLzTUHYAZvPdrO7mL6UYIf0Aww=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.Fonts.OpenSans.wasm",
        "name": "Uno.Fonts.OpenSans.04g2fpfc5u.wasm",
        "hash": "sha256-ECFGixlxFbcb6ubhlHqru4wivMA0b3Zt/Xd5v885drA=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.Fonts.Roboto.wasm",
        "name": "Uno.Fonts.Roboto.dy0mh2j2ha.wasm",
        "hash": "sha256-VVcMtpjJiaNiR4K0wZJqD65ZMt4cDmPVYzpBg0pR3es=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.Foundation.Logging.wasm",
        "name": "Uno.Foundation.Logging.ufekl5kinr.wasm",
        "hash": "sha256-Gq8euNRenkYplY47cdnKouQrLIVxX3juHyHJ4GjRhcw=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.Foundation.Runtime.WebAssembly.wasm",
        "name": "Uno.Foundation.Runtime.WebAssembly.mzy2euu7e2.wasm",
        "hash": "sha256-XjwaDvQbCjybuAJmjF7thERUzLZu9hCX6C+Izy5zWV8=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.Material.WinUI.wasm",
        "name": "Uno.Material.WinUI.2yn7tz8pie.wasm",
        "hash": "sha256-+t3XdvfEAEocJq7ZvoPgSl8kIVlsHHhgb15jYMdE178=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.Xaml.Interactivity.wasm",
        "name": "Microsoft.Xaml.Interactivity.w3w1cyblj8.wasm",
        "hash": "sha256-zJzilrDBx9wpwEbGJZ2DtEUHCECfGPUrLhoHZEUlnZU=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.Xaml.Interactions.wasm",
        "name": "Microsoft.Xaml.Interactions.ns8lc7cu65.wasm",
        "hash": "sha256-OZhYtNLqAiu2Rkfl4k/qq4nSx2C1Wsk13U6XWv6A+YQ=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.ShowMeTheXAML.wasm",
        "name": "Uno.ShowMeTheXAML.rl69mv46k7.wasm",
        "hash": "sha256-r/u125Jl9mZkYt4ZNnlFeSYNlEDscSwp58dfp3inEcw=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.Themes.WinUI.wasm",
        "name": "Uno.Themes.WinUI.9qidndy56k.wasm",
        "hash": "sha256-7zSBwXauwjD8SHYTyXnKXBcfCdPRXxJ+e/EsCKGPMZM=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.Toolkit.wasm",
        "name": "Uno.Toolkit.w86rp731k7.wasm",
        "hash": "sha256-oAKWZdnhvpf2GpXTcfEQgPrkvn4FGH1q7rpYgcxuV5I=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.Toolkit.Skia.WinUI.wasm",
        "name": "Uno.Toolkit.Skia.WinUI.6c5jomv5wl.wasm",
        "hash": "sha256-Ov6yw2eTwTDlT+mA3V8q91bzbSjFvs0B31rZI7HqZ+k=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.Toolkit.WinUI.wasm",
        "name": "Uno.Toolkit.WinUI.8yfc6i5klb.wasm",
        "hash": "sha256-wHm7z73okBULAKRE2EGA0aGY17nhRUBuoVzJiy2khbs=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.Toolkit.WinUI.Cupertino.wasm",
        "name": "Uno.Toolkit.WinUI.Cupertino.213ezdnnlp.wasm",
        "hash": "sha256-1o3QmTKKIswJDVO6JaxFwRWORRs8QwKQZO4Ce35rjxU=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.Toolkit.WinUI.Material.wasm",
        "name": "Uno.Toolkit.WinUI.Material.v6pcghrlli.wasm",
        "hash": "sha256-h+5mL3XY/nQwC3UNYZM6a1sTYauspe7xQYPviXw6WvI=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.UI.Adapter.Microsoft.Extensions.Logging.wasm",
        "name": "Uno.UI.Adapter.Microsoft.Extensions.Logging.fnchpcgt20.wasm",
        "hash": "sha256-SwMtMO+LU5djVc0VF6E9TTKZqsy0uPo/xod7mPWF+sI=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.WinUI.Graphics2DSK.wasm",
        "name": "Uno.WinUI.Graphics2DSK.o2xh2guvqb.wasm",
        "hash": "sha256-UByy3akQHy+h1qB7+fNXw3ZlhpswFciO83vwxW1BHzQ=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.UI.Runtime.Skia.wasm",
        "name": "Uno.UI.Runtime.Skia.vqzxmkrvww.wasm",
        "hash": "sha256-N0mRDt5w5f5GjUKUOnefnGYLbx8PdnHoShDe3AWE1gw=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.UI.Runtime.Skia.WebAssembly.Browser.wasm",
        "name": "Uno.UI.Runtime.Skia.WebAssembly.Browser.jfjysypwdf.wasm",
        "hash": "sha256-34rJYiSWCtUeMu24kZmskciFF02+6wL6dxQW/wTxGcE=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.Foundation.wasm",
        "name": "Uno.Foundation.138yh8d3c8.wasm",
        "hash": "sha256-bb5LxNR4+FAlXWsibKe90LfhltnvGjmoOd0Yu0FS+sM=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.wasm",
        "name": "Uno.bjl49xbebx.wasm",
        "hash": "sha256-B0MVc7LMBFh0xZkAF93FKjRAGTqKzxtWIYsl9TxdrFs=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.UI.Dispatching.wasm",
        "name": "Uno.UI.Dispatching.llhgteq0g5.wasm",
        "hash": "sha256-522M8f2T3fiFqMxXG+KsWmUd4ukbBfACqZ9v1G7eVeY=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.UI.Composition.wasm",
        "name": "Uno.UI.Composition.hnmxzudy0b.wasm",
        "hash": "sha256-E4QjqpZi1Ez3UjBZRfOgKEQlOSToQfX4HGyG85KwgbA=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.UI.wasm",
        "name": "Uno.UI.wfk23btmdf.wasm",
        "hash": "sha256-/BILoiaD5jd9dlSxki2OjivqMMsK9ymtTXM4AoJlwQ0=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.UI.FluentTheme.wasm",
        "name": "Uno.UI.FluentTheme.nbvln9cb1z.wasm",
        "hash": "sha256-LbOk9nrElfOnkUc3HhCZKyB+rfPgMFG2rJxwSoQu9c8=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.UI.FluentTheme.v1.wasm",
        "name": "Uno.UI.FluentTheme.v1.9w069zz9ju.wasm",
        "hash": "sha256-Cc9pxYO3+P4H+NyKjfVphxsayZNuXjhxmucf7m8rEM8=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.UI.FluentTheme.v2.wasm",
        "name": "Uno.UI.FluentTheme.v2.sjm74tsyht.wasm",
        "hash": "sha256-GDoANw8ptG6iQg1FUkh3Matx6A1VsCJ9UnW2VnoKMZA=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.UI.Toolkit.wasm",
        "name": "Uno.UI.Toolkit.bmsn4ybjme.wasm",
        "hash": "sha256-o6xDSFM3GcJNUvMztO+Rrsqdsjk8fvvUoHfMonra7Zs=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.Xaml.wasm",
        "name": "Uno.Xaml.b2dj1pgmak.wasm",
        "hash": "sha256-HRKqen3vy3OaaIuRNvGFnDJ4iprq16Lr66rSAzFwLkI=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.UI.Svg.wasm",
        "name": "Uno.UI.Svg.f04lwptjby.wasm",
        "hash": "sha256-cURcmwlza2OJHpmJBdB8WOMQKluEx9+Hy7ZYL9ngnl0=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.UI.Lottie.wasm",
        "name": "Uno.UI.Lottie.8yctumljvo.wasm",
        "hash": "sha256-0Ox5vOkz4ix+LN8QXMNVFLKZplFuwquhP8Z+MhBKKZY=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "SkiaSharp.Views.Windows.wasm",
        "name": "SkiaSharp.Views.Windows.wrqrywa2gm.wasm",
        "hash": "sha256-tD2leG0mPqOpFWiCBKbUHKxsXCB+bAV/jdG7vhkTCok=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.CSharp.wasm",
        "name": "Microsoft.CSharp.8jga43uhrf.wasm",
        "hash": "sha256-NAKr0/96kNkEUoO6DcxrbMxNVImvShwUk0GpI7UzdW0=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.VisualBasic.Core.wasm",
        "name": "Microsoft.VisualBasic.Core.osvf7w3gv6.wasm",
        "hash": "sha256-uGXbcYxF+rtysWqnEVYdN1hhe0FKzGkZ2bpLGKuV0gk=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.VisualBasic.wasm",
        "name": "Microsoft.VisualBasic.cudg38ub6m.wasm",
        "hash": "sha256-FE3s5KMmsxdoHJyxQTqcj3+OQBeKW20DA7XX5lhnjyk=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.Win32.Primitives.wasm",
        "name": "Microsoft.Win32.Primitives.yj6k1h65ax.wasm",
        "hash": "sha256-LoOMPYc3AAo40zZViPpJmARRdlU5QQQVLXnbE7jyqBM=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Microsoft.Win32.Registry.wasm",
        "name": "Microsoft.Win32.Registry.zxq9tjuiey.wasm",
        "hash": "sha256-p7mS9aQHkMduEmV/j2XvqiBzk7IxOHGdXWrDc8hzKxo=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.AppContext.wasm",
        "name": "System.AppContext.894f2r80d3.wasm",
        "hash": "sha256-tC5xHYYK3EDEREEnGrtX6Z9XaQTa/jKt9+pfUSDfYLk=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Buffers.wasm",
        "name": "System.Buffers.jqs262ztwx.wasm",
        "hash": "sha256-+3uxb+kkAL0SJCP/VdjgFB+33fHUe3GuW5A5p/2DfFQ=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Collections.Concurrent.wasm",
        "name": "System.Collections.Concurrent.bk13rzcojr.wasm",
        "hash": "sha256-Va77h/CmQXeZEPEz8RPC4Cd6B0HXLwFZdiygCPBcj5U=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Collections.Immutable.wasm",
        "name": "System.Collections.Immutable.z3pi8zgemd.wasm",
        "hash": "sha256-n0MxWWMtwr1WhcRXUi3FCEXxyXA/v8PJKgSzv1OnC4A=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Collections.NonGeneric.wasm",
        "name": "System.Collections.NonGeneric.8pnj6qqxnb.wasm",
        "hash": "sha256-vExNU2Zso74IbVePH6nzxcEDCTJt1RqpoHqVTUOioTs=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Collections.Specialized.wasm",
        "name": "System.Collections.Specialized.mji1u7gpml.wasm",
        "hash": "sha256-3lGkjhMk1TPU1RvXDLZW6jhAIp99hkmiGvThPeUNOqE=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Collections.wasm",
        "name": "System.Collections.pjdo8gmsfx.wasm",
        "hash": "sha256-a/3p8Jqpu9iOA2a0LYGKCoOUhyoWuosVxShZOMGm6oU=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.ComponentModel.Annotations.wasm",
        "name": "System.ComponentModel.Annotations.5cbbxjf1g2.wasm",
        "hash": "sha256-JStIh78RDvg03M8SytLr1dwDziW7OeOMwP78eSSQzqo=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.ComponentModel.DataAnnotations.wasm",
        "name": "System.ComponentModel.DataAnnotations.8yermks1ud.wasm",
        "hash": "sha256-kNXt7n33GJD67H/lt9iGJcYOFqA3HANmiW0qCMN1JQk=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.ComponentModel.EventBasedAsync.wasm",
        "name": "System.ComponentModel.EventBasedAsync.kyavm40xe2.wasm",
        "hash": "sha256-xBC/o0ARuz3iTiYtUE8PsEc9j2U5xSK13BKzcK0h+UI=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.ComponentModel.Primitives.wasm",
        "name": "System.ComponentModel.Primitives.uvhg19gdmu.wasm",
        "hash": "sha256-imNt4OJxd+0Hn+XaeOyHCQfbW/j3fZZGg3QNoK4YZ8k=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.ComponentModel.TypeConverter.wasm",
        "name": "System.ComponentModel.TypeConverter.ceou67jzth.wasm",
        "hash": "sha256-BAmcmE0S909Etkpcd71R2JgqUNl6/gRF5xs5p457NTQ=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.ComponentModel.wasm",
        "name": "System.ComponentModel.o9fs7z180v.wasm",
        "hash": "sha256-TB+Z6NEMpwFY1gTxKHJMT+MUZKIHdyWQZ9abodkIzQg=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Configuration.wasm",
        "name": "System.Configuration.ew0w2yqwgq.wasm",
        "hash": "sha256-jnarL5J3929xzdbN4hJuAABupzH4YXSo7ydrnx4EeA8=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Console.wasm",
        "name": "System.Console.bxq78npckm.wasm",
        "hash": "sha256-D9iGtOBNwNkNcu95SXXF7kNWtm+W6ZNY9DAizvDGRsM=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Core.wasm",
        "name": "System.Core.ppnax80ue4.wasm",
        "hash": "sha256-cwhc8VzCYOLQOjjyBoDU/slbtQZ8YF3iHPCUAusuEVI=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Data.Common.wasm",
        "name": "System.Data.Common.m1y8nzn5lz.wasm",
        "hash": "sha256-pg6lHfISpfjbAa0ptxrqMWVjGjxn3TEIkkb42BLaiIE=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Data.DataSetExtensions.wasm",
        "name": "System.Data.DataSetExtensions.l9zefxebdn.wasm",
        "hash": "sha256-9yJdwrid7o3SHNEQuzDGqKgFADzykaaIHwDuJbjhJB4=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Data.wasm",
        "name": "System.Data.71xayg3rfw.wasm",
        "hash": "sha256-RajJV1jz5e/7wFeIlUhD0kPCZq+J0tO/AarC+nC9b7k=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Diagnostics.Contracts.wasm",
        "name": "System.Diagnostics.Contracts.8osmfw5jcu.wasm",
        "hash": "sha256-WMYM/S6bi8eLKTkJlBt31pIUBxy5NXveoTzyX/FumGE=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Diagnostics.Debug.wasm",
        "name": "System.Diagnostics.Debug.jy8a62fmzd.wasm",
        "hash": "sha256-JTbnQnd1RFuZr2yFS642pJAs8ZipbhQru/vLJyln0og=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Diagnostics.DiagnosticSource.wasm",
        "name": "System.Diagnostics.DiagnosticSource.a406wb6ax2.wasm",
        "hash": "sha256-5q0QpaxVjsK8FVt+CxNoAtMMQi6FWIzgVVjANjSODqs=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Diagnostics.FileVersionInfo.wasm",
        "name": "System.Diagnostics.FileVersionInfo.j50e3vgdpz.wasm",
        "hash": "sha256-R/fvAX93OCMPE/IpNjHPDTO91WCSa9QSPGwiAswXJSA=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Diagnostics.Process.wasm",
        "name": "System.Diagnostics.Process.4rphi66lkl.wasm",
        "hash": "sha256-YJloKa+MjW/U1XwrERC4nHhQFo7eOXh5BExvljbnZRI=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Diagnostics.StackTrace.wasm",
        "name": "System.Diagnostics.StackTrace.wsisinbl4f.wasm",
        "hash": "sha256-0LMo6W+SG0j8I/yZ7Pst+pDuR44I+jtK8CMs97OvVL0=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Diagnostics.TextWriterTraceListener.wasm",
        "name": "System.Diagnostics.TextWriterTraceListener.rf2uipyh01.wasm",
        "hash": "sha256-KeI8EBgXJjeFBRRWO995m73w9GKvCIBHB49zJWjePTs=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Diagnostics.Tools.wasm",
        "name": "System.Diagnostics.Tools.d50c0vj38f.wasm",
        "hash": "sha256-wVf/YCXsMPYY6LErmujn4V5h9BVvad75qHBQ+Uo/4GU=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Diagnostics.TraceSource.wasm",
        "name": "System.Diagnostics.TraceSource.mlaaefrwe6.wasm",
        "hash": "sha256-Km5yxnE64MNm01QZuOn01lx2P017FLyYMNLCz102DTA=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Diagnostics.Tracing.wasm",
        "name": "System.Diagnostics.Tracing.jk9vyom5xd.wasm",
        "hash": "sha256-M6Q0eiBWuvckamI6dwm42j0jZxtUL+TABfvcxx/tOKA=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Drawing.Primitives.wasm",
        "name": "System.Drawing.Primitives.holiqy1rqu.wasm",
        "hash": "sha256-v8/88BmK+nXKgydGoOAGxm/oKVyQm69uX4y+eab9iio=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Drawing.wasm",
        "name": "System.Drawing.lhknmp1cit.wasm",
        "hash": "sha256-ebFexcB2o/Z7d+geDI6uUados52Amn5Vr4akfhuKavk=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Dynamic.Runtime.wasm",
        "name": "System.Dynamic.Runtime.rez365ep69.wasm",
        "hash": "sha256-/Q+tcywGqTPt507oDz4cOiItMFluAYQwGv0bnPJN2IQ=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Formats.Asn1.wasm",
        "name": "System.Formats.Asn1.qskxdy9kxk.wasm",
        "hash": "sha256-imy01+jVa+0Yce0wHoX5IpmFFbA/S1WbwYt57JwUgc4=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Formats.Tar.wasm",
        "name": "System.Formats.Tar.1qe5yiywv7.wasm",
        "hash": "sha256-yeN9+1gFpqQQhzQ9MK/DTEMI0AjhbESVSkqspE/03jQ=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Globalization.Calendars.wasm",
        "name": "System.Globalization.Calendars.676jzcv465.wasm",
        "hash": "sha256-IklUzK5d/scEFFVD4hG47oWVzh1Ih6iVJuooJzHX+rg=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Globalization.Extensions.wasm",
        "name": "System.Globalization.Extensions.uz8x1abovr.wasm",
        "hash": "sha256-NpvN5hk8EuOhVSTv387zVCzzQLvfVN3Z7HR/JpHqrMA=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Globalization.wasm",
        "name": "System.Globalization.x3eb0lmts0.wasm",
        "hash": "sha256-LTBcMUo/928GEc4fTzQQzYUaZS7NjQLRdad+ly7wwwY=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.IO.Compression.Brotli.wasm",
        "name": "System.IO.Compression.Brotli.ad33ci4c31.wasm",
        "hash": "sha256-MngMQe95RnPABvaQpkb/Cu8wPgtE895BGkq0J7sP+C8=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.IO.Compression.FileSystem.wasm",
        "name": "System.IO.Compression.FileSystem.ewpqksy04w.wasm",
        "hash": "sha256-Ylbuu3CJrguru5jeKKorr0kOWFuTJ7xB5eaZ24iJfjg=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.IO.Compression.ZipFile.wasm",
        "name": "System.IO.Compression.ZipFile.773t2e140m.wasm",
        "hash": "sha256-c/+cMMwbQidFotU/uwxGBk/AmjS0F64WODmMNbHZblA=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.IO.Compression.wasm",
        "name": "System.IO.Compression.aphkuf486t.wasm",
        "hash": "sha256-Yq9IwW9u2/70TsfnMWi3FhABMH0nmUxRMU5f13Jc+68=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.IO.FileSystem.AccessControl.wasm",
        "name": "System.IO.FileSystem.AccessControl.1h39to8fnr.wasm",
        "hash": "sha256-K6kheG68g26kAi5tXrkfKSr2clxbEqX3OIDgKOIfivs=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.IO.FileSystem.DriveInfo.wasm",
        "name": "System.IO.FileSystem.DriveInfo.pp5b3gl2wk.wasm",
        "hash": "sha256-reTnG55bKHhJsapT5eaYfz9KCrPQxzwsRdTOkLd7LU8=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.IO.FileSystem.Primitives.wasm",
        "name": "System.IO.FileSystem.Primitives.wjnnihke1u.wasm",
        "hash": "sha256-/Mywm+tw6Bx+ZJh9yxcbx5Sip6bJA4HJXwmOyjjOfj0=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.IO.FileSystem.Watcher.wasm",
        "name": "System.IO.FileSystem.Watcher.9cqti61mp1.wasm",
        "hash": "sha256-meQn67JgFzp5u/8b9MDppC2Xg7zCQ4/ZyVIiYkQ441Q=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.IO.FileSystem.wasm",
        "name": "System.IO.FileSystem.djnd208vm2.wasm",
        "hash": "sha256-l8UyHj3e99iMVmOMNZHFuDIU6e43vBrCyKIxg1wvavI=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.IO.IsolatedStorage.wasm",
        "name": "System.IO.IsolatedStorage.2n23tumliq.wasm",
        "hash": "sha256-HkUJtlui/3ZJSHgnsskxJyJ2EOD9/VkpV5ZCDEJ16Ds=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.IO.MemoryMappedFiles.wasm",
        "name": "System.IO.MemoryMappedFiles.5gom6k59ys.wasm",
        "hash": "sha256-RUtcijbt81c8wav6/TLtjbim1zaS934LLH+R6Ql+Xrw=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.IO.Pipelines.wasm",
        "name": "System.IO.Pipelines.ijbzwqgakr.wasm",
        "hash": "sha256-0pJuGXFO4M/QzI2dwEcB9UlzX38XWtOTb2B/HbNsUoU=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.IO.Pipes.AccessControl.wasm",
        "name": "System.IO.Pipes.AccessControl.veabj5310i.wasm",
        "hash": "sha256-iV8oKk8fklKk4PT6rIRKDD8Qxx4ADahoGvWVyKyAgs8=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.IO.Pipes.wasm",
        "name": "System.IO.Pipes.ln190fokee.wasm",
        "hash": "sha256-X3Ntgn40Rt2y02GnEppSr+oUYBBTktMK/TqP91udP4I=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.IO.UnmanagedMemoryStream.wasm",
        "name": "System.IO.UnmanagedMemoryStream.iyzvumv08f.wasm",
        "hash": "sha256-yq2ITTvjjtsigMS+8K/otas9U/MkcLXg8xSqas+MNz4=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.IO.wasm",
        "name": "System.IO.usw9uwif4w.wasm",
        "hash": "sha256-TkxFV64643h3M7FDWvpdpZbIFAjQt08WX6+xEsx7WTI=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Linq.AsyncEnumerable.wasm",
        "name": "System.Linq.AsyncEnumerable.1765f0n5vi.wasm",
        "hash": "sha256-nc084lI1BhJYUMro+MIHkTqvUVjrPjSybIstIjetbzU=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Linq.Expressions.wasm",
        "name": "System.Linq.Expressions.zlew32mgkt.wasm",
        "hash": "sha256-CWMfc+nBOfCER1kDJxzX9vyByik/7WjBQlUzqI5RRRU=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Linq.Parallel.wasm",
        "name": "System.Linq.Parallel.loxrks7rqr.wasm",
        "hash": "sha256-RZfOx8oCXFc2OLl7t37z+jL0DwiBEoypacUBCL+Y7uc=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Linq.Queryable.wasm",
        "name": "System.Linq.Queryable.i3ctyg90d2.wasm",
        "hash": "sha256-gutsChiY3mfrC5ASVk0x/5BzHFe2tkiuD12YNToH1so=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Linq.wasm",
        "name": "System.Linq.avq4lmhwpy.wasm",
        "hash": "sha256-+kFfzeqyWLC8znIQT71aTioQPBZmmNzAlSvUU5qiwEY=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Memory.wasm",
        "name": "System.Memory.71vfw2zl5c.wasm",
        "hash": "sha256-Jd1L1NVJe+3VaRmX0VudIPVI2lJ1R4bQg6PrsaAPO90=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Net.Http.Json.wasm",
        "name": "System.Net.Http.Json.zl3bg9d9ym.wasm",
        "hash": "sha256-+TQA5/DOUjq9N4ftNCTMF+LUTSxlKQ+gnmUr2gW00Qk=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Net.Http.wasm",
        "name": "System.Net.Http.0bjnqef9e3.wasm",
        "hash": "sha256-hLzDNbY6L56naiAFUOP5ywOrA+H1Kn62aHxJgRWOaIE=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Net.HttpListener.wasm",
        "name": "System.Net.HttpListener.5xo5i6dx9j.wasm",
        "hash": "sha256-aUcArdhw2X1LHkXZMOGSvwnEs64+1K6EoY06+HdQzy8=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Net.Mail.wasm",
        "name": "System.Net.Mail.wigfgdkij3.wasm",
        "hash": "sha256-aCU8axxanJxoaM/RJO4YERaxARjf04jS/Re+u5QcRr0=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Net.NameResolution.wasm",
        "name": "System.Net.NameResolution.q5edcltvpn.wasm",
        "hash": "sha256-EucfpRPmy4vxn2NmWsQ36jpk/eTaTBH6hxbR+NjKeoA=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Net.NetworkInformation.wasm",
        "name": "System.Net.NetworkInformation.hf8brws0qa.wasm",
        "hash": "sha256-k8X3HUiAenb657EZgA6QnqFh+V3m86EzfD9t3nWl9uk=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Net.Ping.wasm",
        "name": "System.Net.Ping.xy27x5l39k.wasm",
        "hash": "sha256-N/C37ZhFjfWPM12himORhDKKyv2nnUArqt8eVI6oFcM=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Net.Primitives.wasm",
        "name": "System.Net.Primitives.m9a02bx7c1.wasm",
        "hash": "sha256-Bq4SEaUA5JOa19Yh2y0PSVoFQtgb9rBHsflJjZmt/y8=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Net.Quic.wasm",
        "name": "System.Net.Quic.25qdqw7yag.wasm",
        "hash": "sha256-anCfr2LC8STq8+xV42Je6UdylgTR1oE1emM4IRAvNUM=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Net.Requests.wasm",
        "name": "System.Net.Requests.iakqgwkken.wasm",
        "hash": "sha256-xkYa6E7zXoXZTVZOyjGB3t4QipRi1XaA2gy+WwjI6UI=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Net.Security.wasm",
        "name": "System.Net.Security.teh6j5l48h.wasm",
        "hash": "sha256-pRTCeOglDGFzA9//hfVScCovIWDBqERqu/b6/rjvXC4=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Net.ServerSentEvents.wasm",
        "name": "System.Net.ServerSentEvents.x49ow9xcwo.wasm",
        "hash": "sha256-v8e+sa8nwj+6VC1Zm6o8jnI384x6O5SrnwoVkgfoKzg=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Net.ServicePoint.wasm",
        "name": "System.Net.ServicePoint.33cx0vnqyr.wasm",
        "hash": "sha256-kXgjhPVT+UmV1Oeov6MPMxGP4jNF11+GYa7WgckLezk=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Net.Sockets.wasm",
        "name": "System.Net.Sockets.9m64blkeqh.wasm",
        "hash": "sha256-f+YwLHr9HPbc+gzTXsGNGkMRBSqhYqWlpS6UrjwYGEU=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Net.WebClient.wasm",
        "name": "System.Net.WebClient.2udc3963zw.wasm",
        "hash": "sha256-9mfikAmKpn2WTCCXlPxoBzybKAstzV1H4DOW+5TvLxw=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Net.WebHeaderCollection.wasm",
        "name": "System.Net.WebHeaderCollection.w983qt2i4e.wasm",
        "hash": "sha256-pNrLg3NiSXEMM35EGI1QMOeW6I5R0QUbACJngO7XbUk=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Net.WebProxy.wasm",
        "name": "System.Net.WebProxy.mvl12q67xb.wasm",
        "hash": "sha256-Ai/EIQ15+DMNTymu8B5UFkjcQIDidAkOfjptN4rl77Y=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Net.WebSockets.Client.wasm",
        "name": "System.Net.WebSockets.Client.w2l9ehqqh5.wasm",
        "hash": "sha256-CFuu91WGXzyhCCzg1INfKBrVrErCd7IXx646gTyuXIU=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Net.WebSockets.wasm",
        "name": "System.Net.WebSockets.37xbyblg4d.wasm",
        "hash": "sha256-McWSqLYScW++w6uWTs+53YqzvTuuqs5Q3fIrc3YUoxg=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Net.wasm",
        "name": "System.Net.i9rbcn6ob0.wasm",
        "hash": "sha256-xgbcQR24y9hGmPjUi6HQFd5YTuWdqjG80X8TJrX18qQ=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Numerics.Vectors.wasm",
        "name": "System.Numerics.Vectors.m274b89c1h.wasm",
        "hash": "sha256-MmjmL16e8sGpsoL3+Xkp9cTZbeuKCjqq3JNWuW+GCr8=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Numerics.wasm",
        "name": "System.Numerics.4ljt75ydpp.wasm",
        "hash": "sha256-aAOkawMbJksjoZyT+w0AP5+2UjMM4tpDNTF3x7NE+rg=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.ObjectModel.wasm",
        "name": "System.ObjectModel.xjkgl0rnmn.wasm",
        "hash": "sha256-8475FBKDjvzrL34eEmgYaWCgSuNmJ37tA/KGWdwwVNM=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Private.DataContractSerialization.wasm",
        "name": "System.Private.DataContractSerialization.57q4n6920w.wasm",
        "hash": "sha256-X0O7H3VUGM/J0/7WU3UQBNa7FYu9uboIJ56jnHX2zxs=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Private.Uri.wasm",
        "name": "System.Private.Uri.buy6y5zgty.wasm",
        "hash": "sha256-HUTGGBJVpmDsjBUpAS4Xv7xIzYj1lXx3ISG3VDbZBpU=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Private.Xml.Linq.wasm",
        "name": "System.Private.Xml.Linq.c4u5t4ask9.wasm",
        "hash": "sha256-RGuMe4W+5jaooRcnoZV7NdL8VgYrblG4BEOu5k/RN9c=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Private.Xml.wasm",
        "name": "System.Private.Xml.hc36g70q90.wasm",
        "hash": "sha256-j537WUrd4Z3dBg4cQJRmsfwjYjtO4YmOd7fJfUqaEHQ=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Reflection.DispatchProxy.wasm",
        "name": "System.Reflection.DispatchProxy.xfr6yrx62b.wasm",
        "hash": "sha256-bQ7QMOt6I0Yp6dWs3PL3yILwLp5RUBZLW/6tPv7bkfM=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Reflection.Emit.ILGeneration.wasm",
        "name": "System.Reflection.Emit.ILGeneration.eag4v7lm3y.wasm",
        "hash": "sha256-ignXbcTeJe68ikNhS8qeaiG9jabYUKP+X/8+BMTX+ys=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Reflection.Emit.Lightweight.wasm",
        "name": "System.Reflection.Emit.Lightweight.63fi8achic.wasm",
        "hash": "sha256-4oxtoqQQVDBujcK7yiK7EME6Sj09TNuCKQnqQTITszs=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Reflection.Emit.wasm",
        "name": "System.Reflection.Emit.upxc4jdb3m.wasm",
        "hash": "sha256-snWFGkbpWK1i5zIN1PxXLQEYMb1jGYgZ6e2Uvzj9kbA=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Reflection.Extensions.wasm",
        "name": "System.Reflection.Extensions.ns8meim3fi.wasm",
        "hash": "sha256-+bPc7qXrIQCr/BVIKOBOOi1ApLT+UJmyPeG6zvHaZ9Q=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Reflection.Metadata.wasm",
        "name": "System.Reflection.Metadata.0qtx47eqjq.wasm",
        "hash": "sha256-SIvGGtmm8FqPE37j87CmRgXM/NwDnsEw++lpu5iC8bQ=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Reflection.Primitives.wasm",
        "name": "System.Reflection.Primitives.pkzx1c5uhh.wasm",
        "hash": "sha256-WVO9gndO1+pD0we5GIHHpa2ugoxEFDPhUd3i5HcGeSc=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Reflection.TypeExtensions.wasm",
        "name": "System.Reflection.TypeExtensions.led6o0tmep.wasm",
        "hash": "sha256-XfGLbqICCARv9RgyLRJSxtXyefOlbgKETNcCRZaLark=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Reflection.wasm",
        "name": "System.Reflection.sxn1o4rtk0.wasm",
        "hash": "sha256-cMcKPqM/j1dTbuIYrU5UZoxWRk6ZLwYMJBfWxtn3JaE=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Resources.Reader.wasm",
        "name": "System.Resources.Reader.pbp3mw4sbg.wasm",
        "hash": "sha256-C8dOhn6P6a3uZJZ2uOy44MVAimmjkXpkCz5Ew/DsRfw=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Resources.ResourceManager.wasm",
        "name": "System.Resources.ResourceManager.hr4qzhkyd2.wasm",
        "hash": "sha256-Y75gR6wJ4enOqb35HDdAmZv4q97c1yyuLdRxA1f2mNc=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Resources.Writer.wasm",
        "name": "System.Resources.Writer.js89ehrgpm.wasm",
        "hash": "sha256-PQmSYEXLMkPuwqUnepsSGT2eHFssmSMzgh/zLm15A1I=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Runtime.CompilerServices.Unsafe.wasm",
        "name": "System.Runtime.CompilerServices.Unsafe.u2u6n7w9hk.wasm",
        "hash": "sha256-xhCg8x9HYbZVD6EkpemQD3n7RhsDYHfLQuGiwkE8Fqc=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Runtime.CompilerServices.VisualC.wasm",
        "name": "System.Runtime.CompilerServices.VisualC.yqospeeik3.wasm",
        "hash": "sha256-toKSRnPCeJ3dyTopiyH0W2dfo23jGZ0hmfgWIpg/7J8=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Runtime.Extensions.wasm",
        "name": "System.Runtime.Extensions.5u7ua5qmkh.wasm",
        "hash": "sha256-LSGEocIbxPM57gMlD3RSkmUHnThJJzTSm6NAazoUlOs=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Runtime.Handles.wasm",
        "name": "System.Runtime.Handles.glxbowd5pe.wasm",
        "hash": "sha256-1CbQSX29m7MoiYanUje+6dHihSwaUWEFdQA7zG6ZAm4=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Runtime.InteropServices.RuntimeInformation.wasm",
        "name": "System.Runtime.InteropServices.RuntimeInformation.kd4g31t253.wasm",
        "hash": "sha256-2K7K+kzlXNj1mfioqU2IDMXth00ZWAInc4LzAGJtDzk=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Runtime.InteropServices.wasm",
        "name": "System.Runtime.InteropServices.nc7duhg8an.wasm",
        "hash": "sha256-iddXXl56dXOwW+ad5xEDIrWgNjkKx3MK/oV2VH+qTdE=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Runtime.Intrinsics.wasm",
        "name": "System.Runtime.Intrinsics.0gxxjqzvqj.wasm",
        "hash": "sha256-cE3dPxSiYPaov1tqQPULuzyLzXK7eU3xwncO9C8DHdE=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Runtime.Loader.wasm",
        "name": "System.Runtime.Loader.gtwx5yyukp.wasm",
        "hash": "sha256-nE6KZuDwDhDZE8Rla+muz172m9wPv++jAUXFfMWvf+0=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Runtime.Numerics.wasm",
        "name": "System.Runtime.Numerics.pudsbh6h07.wasm",
        "hash": "sha256-31t0K6D3AS7AbNbWViEEePea5oUIXQ9Z7P+hYuQMccM=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Runtime.Serialization.Formatters.wasm",
        "name": "System.Runtime.Serialization.Formatters.0d0qcpkc1s.wasm",
        "hash": "sha256-rKvGRINLsyb3XQkScHwGHvxje4vWt4UQ64wyVnPwymI=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Runtime.Serialization.Json.wasm",
        "name": "System.Runtime.Serialization.Json.7osqbt5253.wasm",
        "hash": "sha256-WZ2VCokSqEWX1xK9ZwU3UukeOI1NBCwHqPKf3z24G1s=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Runtime.Serialization.Primitives.wasm",
        "name": "System.Runtime.Serialization.Primitives.v9du80tgbw.wasm",
        "hash": "sha256-TYlJxXiGwif3OubCx4uzW+UyhrLyx/AdfT1ldrQeIVA=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Runtime.Serialization.Xml.wasm",
        "name": "System.Runtime.Serialization.Xml.ijbfat8uth.wasm",
        "hash": "sha256-LsaUduNcgmoYGd5CNC1Rw55bTRMrEBu/CXVTRHanQXo=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Runtime.Serialization.wasm",
        "name": "System.Runtime.Serialization.s12b99sjsw.wasm",
        "hash": "sha256-IMzOqv1b5z4D2frIhWYGAWuv03Y6YKCZOSb7yWlT8io=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Runtime.wasm",
        "name": "System.Runtime.7p7hlcxcws.wasm",
        "hash": "sha256-OzZCFcwC8HI/23pWMauwXbOWQmmPEP8ovC6ycbsFdbU=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Security.AccessControl.wasm",
        "name": "System.Security.AccessControl.5ap4h0hav7.wasm",
        "hash": "sha256-/ZmgJtGoimxfwr9o6VcLuLcJZ+DY/ntWwsN/D19J09Q=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Security.Claims.wasm",
        "name": "System.Security.Claims.ks7vmfc6oy.wasm",
        "hash": "sha256-zBTsh7qQ5BvihZatZ3W933rqIb+6PPE948LCqXVxK1A=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Security.Cryptography.Algorithms.wasm",
        "name": "System.Security.Cryptography.Algorithms.0awzuxw8uv.wasm",
        "hash": "sha256-KJCX3By+EvZnK/lItxXhs35NH8GWqt47bZuwc5hLkPU=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Security.Cryptography.Cng.wasm",
        "name": "System.Security.Cryptography.Cng.z40gc1pzx8.wasm",
        "hash": "sha256-TRsaP0CdWrzJ3JPaoLpgzHs5iEt+nunJIzrViJC5zOg=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Security.Cryptography.Csp.wasm",
        "name": "System.Security.Cryptography.Csp.nwrezbxlct.wasm",
        "hash": "sha256-ORzTVTrmZe3YbaxEyz1cePdkXA8hybsmOs+m21ObVa8=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Security.Cryptography.Encoding.wasm",
        "name": "System.Security.Cryptography.Encoding.r6u5vvwbr7.wasm",
        "hash": "sha256-E0POfBslIxVeIaBcUygeeD3pj6WorN01XTmrUkFoIyw=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Security.Cryptography.OpenSsl.wasm",
        "name": "System.Security.Cryptography.OpenSsl.eo8i4kz5wj.wasm",
        "hash": "sha256-kj/F9qVptRGvNRzVRkNTH10e7K3+pMnAkHpBNiFBR/8=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Security.Cryptography.Primitives.wasm",
        "name": "System.Security.Cryptography.Primitives.tksc99c0v3.wasm",
        "hash": "sha256-rUifQ5gdj2p2B03Cp03oLcp2yj5UQkcSp4tdRQfTjSI=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Security.Cryptography.X509Certificates.wasm",
        "name": "System.Security.Cryptography.X509Certificates.cgeylnvd1x.wasm",
        "hash": "sha256-VGH3WdbHp1OQieln923xrq+of+zEdKA1x2AZYvjahiw=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Security.Cryptography.wasm",
        "name": "System.Security.Cryptography.ohm40fbrz6.wasm",
        "hash": "sha256-3FZkV//Xk09K/bAeQqdVo4tE7cAIeMVAbaUIA6xmT+Q=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Security.Principal.Windows.wasm",
        "name": "System.Security.Principal.Windows.60imjtiy15.wasm",
        "hash": "sha256-WtT7XGQBVujU6hLEbNOAA62pBre3F1WU98oIPVufLtc=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Security.Principal.wasm",
        "name": "System.Security.Principal.9e6gerkdwh.wasm",
        "hash": "sha256-YR5MbBZddbArqrKNP0VwCTf9YT1A80mMofueMon4bA0=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Security.SecureString.wasm",
        "name": "System.Security.SecureString.p32x7uj6va.wasm",
        "hash": "sha256-GyjLa/2ckF+aNe/Z8yHb2xOnHVifCXbIjaxIFzWqAqI=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Security.wasm",
        "name": "System.Security.yoipoexwz7.wasm",
        "hash": "sha256-4kpWAxcBPIo4a8Z86u7hhIMhFenRMga31EbwrBuvOa0=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.ServiceModel.Web.wasm",
        "name": "System.ServiceModel.Web.e6e4165qxc.wasm",
        "hash": "sha256-xmnrF6SnDBoXaZmFUH3/HcWWC79KatuC7ms97i9gtRk=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.ServiceProcess.wasm",
        "name": "System.ServiceProcess.9audfhk9it.wasm",
        "hash": "sha256-b1ItjAPiYzn2SNVCVHbij8sjm+U8h/8N2NG2GBEuHzk=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Text.Encoding.CodePages.wasm",
        "name": "System.Text.Encoding.CodePages.z4ncu8fk3x.wasm",
        "hash": "sha256-3RErCN6MEx//3BYw/cLB/SAEzXksIPcitAYj8NFuZrs=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Text.Encoding.Extensions.wasm",
        "name": "System.Text.Encoding.Extensions.hnfs7wdmvh.wasm",
        "hash": "sha256-w4qD6mKjCE+ZUiJ6iYZQf6XCg7pPcbcRjyDptTKl6GM=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Text.Encoding.wasm",
        "name": "System.Text.Encoding.pntydftbk1.wasm",
        "hash": "sha256-W9xg9oiwfu7J3Ig/DTFwySbrSfhV2Cqam2d3uDQlQ9g=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Text.Encodings.Web.wasm",
        "name": "System.Text.Encodings.Web.oqquawbq6f.wasm",
        "hash": "sha256-ICOLm8CaRxjAsSoikxit9qi233a7Z4nkfYHjQ1RAYds=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Text.Json.wasm",
        "name": "System.Text.Json.on48e0c80i.wasm",
        "hash": "sha256-bKhkVVjjxXng8drasszeVPjNQKNu6oC4toLH9mV24Y0=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Text.RegularExpressions.wasm",
        "name": "System.Text.RegularExpressions.t8p1ol9986.wasm",
        "hash": "sha256-DZIvCP7O5Llt8Og5KIuQ2pnLBSTQ8yoRoCxUU3ZbsFM=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Threading.AccessControl.wasm",
        "name": "System.Threading.AccessControl.i14i82ts4h.wasm",
        "hash": "sha256-CvvUN78Xq4zxC2aPB2Bj5VMIhu5I3uTUs+clbHiB9GY=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Threading.Channels.wasm",
        "name": "System.Threading.Channels.bjmcptukbq.wasm",
        "hash": "sha256-FyrCQ9wEJNtPQnbl9GKfYN8zDEUtGF/pd6p7DZOFAUk=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Threading.Overlapped.wasm",
        "name": "System.Threading.Overlapped.bpvqt3cbud.wasm",
        "hash": "sha256-/8v9X/Uk38d0p5y2uMats86b+HvLGmCqpWDPYIprz40=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Threading.Tasks.Dataflow.wasm",
        "name": "System.Threading.Tasks.Dataflow.oq5elrvp5y.wasm",
        "hash": "sha256-kMVX306aGBIdRgVh1IIRKeWl/rxWOOeR96qZnxSjg3I=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Threading.Tasks.Extensions.wasm",
        "name": "System.Threading.Tasks.Extensions.j1txdimert.wasm",
        "hash": "sha256-uVn5f0RDOIjl17SQqVCTUy0bt98zXPFCT2O8FZGHOXo=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Threading.Tasks.Parallel.wasm",
        "name": "System.Threading.Tasks.Parallel.axybnj3ype.wasm",
        "hash": "sha256-jthSEA9lUVdEFUq4eKObhs0EdDkunKyjodZS9iUL1FI=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Threading.Tasks.wasm",
        "name": "System.Threading.Tasks.0h6y8wmy4a.wasm",
        "hash": "sha256-vEJ630EBAknC0C94WBKqV+iFsdV33S+Q9+nEqS5GoNE=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Threading.Thread.wasm",
        "name": "System.Threading.Thread.xz8ewib961.wasm",
        "hash": "sha256-Db3NlsMhvtkjvJM94B3k0q8O/cMp6GfMEcWh56xfugs=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Threading.ThreadPool.wasm",
        "name": "System.Threading.ThreadPool.i065cjgdla.wasm",
        "hash": "sha256-sqVIiUpwSMZyqcDE0QcWQvoRKOnW0McDsR9X0FEw2mI=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Threading.Timer.wasm",
        "name": "System.Threading.Timer.1aepz61r9y.wasm",
        "hash": "sha256-ib/z9soF3WV3N5fXsmX3tRFfy/u2auQ6gpfIsuaBImA=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Threading.wasm",
        "name": "System.Threading.vb1l1frs88.wasm",
        "hash": "sha256-BRk6FU6LyM6iBYCHiwXfbKlIp4gwCEJPJLySypvlv1o=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Transactions.Local.wasm",
        "name": "System.Transactions.Local.c36ys9m56t.wasm",
        "hash": "sha256-qKyNJdP/rPn8NWA9M9xFEHtzOl2M+sdIMkd3z8xUfZI=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Transactions.wasm",
        "name": "System.Transactions.c67zip32cj.wasm",
        "hash": "sha256-7Oq92O0NNL2lq2Pd0YsJlsYvY/sAw7uq8uM1DqBa2oQ=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.ValueTuple.wasm",
        "name": "System.ValueTuple.7g8jugxiqu.wasm",
        "hash": "sha256-h1/8VMZX/f1slFsWGQvSo+Ehw+eF6roizQ5QdUcaQHc=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Web.HttpUtility.wasm",
        "name": "System.Web.HttpUtility.cumlwudy0u.wasm",
        "hash": "sha256-HPHcTJL0cUPhJt3i+/NPb8mXm3VuSfP3wXDze0THlvI=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Web.wasm",
        "name": "System.Web.ql8r6xsvtr.wasm",
        "hash": "sha256-Ts6Ux6JCPec8J/2SdJfbMgvNhY6namhZjrh2c3BCkUs=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Windows.wasm",
        "name": "System.Windows.h7lb8c05f9.wasm",
        "hash": "sha256-HTifWOef6x5uwPg6rxcZHarMQdBH4CEihCTueqXEIA0=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Xml.Linq.wasm",
        "name": "System.Xml.Linq.8sd0cgn2q8.wasm",
        "hash": "sha256-yAH/lorCh/J82MiANKuBVmUumLDbvOi1cMpJF1z7AJM=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Xml.ReaderWriter.wasm",
        "name": "System.Xml.ReaderWriter.vpqu12cxmd.wasm",
        "hash": "sha256-PTQGQ+snDd7iAnOKC9VikPOh/8Nl92G4xku5668P4s8=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Xml.Serialization.wasm",
        "name": "System.Xml.Serialization.p5854c4s9c.wasm",
        "hash": "sha256-jSz+HbjS9bB9GchMlFev7CUXfPg2kEGA2GTybLDCvRI=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Xml.XDocument.wasm",
        "name": "System.Xml.XDocument.r1jio1eq7b.wasm",
        "hash": "sha256-EbM4k68LZ+bHq4QZc3IOuG2oQqqAEEtpq3JrVNHVtR8=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Xml.XPath.XDocument.wasm",
        "name": "System.Xml.XPath.XDocument.mzbsout1kn.wasm",
        "hash": "sha256-TnRSqlnPVr7pZg8ALMzYWrL/ynxl1K9geo22wMS8bCQ=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Xml.XPath.wasm",
        "name": "System.Xml.XPath.6nybaipkqo.wasm",
        "hash": "sha256-Iuan5QM9IIQMwT69lO/6dEZ5Dj1WSgBIw9PstG3pIRM=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Xml.XmlDocument.wasm",
        "name": "System.Xml.XmlDocument.3phbvr4ne7.wasm",
        "hash": "sha256-qQZgfSGr/8CFoAOsVSJ6edimwgmCka6iYIqI3VeQrMc=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Xml.XmlSerializer.wasm",
        "name": "System.Xml.XmlSerializer.x8fuhzogor.wasm",
        "hash": "sha256-sUUPfoUjoPhCMM2DEGYjw60vgfdmLHYUr4GhzIqhEGU=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.Xml.wasm",
        "name": "System.Xml.dyg94o1az9.wasm",
        "hash": "sha256-FTIBfqnEvsVNy+y3Y/qJBfi1OBIQ5upQQoGh/7TazoY=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "System.wasm",
        "name": "System.ayloaqe1xv.wasm",
        "hash": "sha256-IpcUlG2dowVmIQ6+gorsS3FsoDoI2kP+v+l6dgvwI60=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "WindowsBase.wasm",
        "name": "WindowsBase.2pnfbhdmww.wasm",
        "hash": "sha256-Srv4BKFVRr6uJCI5FeQqGg9wmwEsfr86lBeXEOKDWbk=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "mscorlib.wasm",
        "name": "mscorlib.3k74z7pr04.wasm",
        "hash": "sha256-Q87nj79/6d5KwzNOUJRH+LJI17bZVINe3K27BTOhdtM=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "netstandard.wasm",
        "name": "netstandard.hudyh4tmcw.wasm",
        "hash": "sha256-Z/QeXJonQMOzT+RYS1b9V6mawbhdJEqwsxZzEl3fPkc=",
        "cache": "force-cache"
      },
      {
        "virtualPath": "Uno.Gallery.wasm",
        "name": "Uno.Gallery.at630y9wyh.wasm",
        "hash": "sha256-wmJuJ246sDTkfnZRpoIRcT+btHUiPw53nKdFfXCdHKQ=",
        "cache": "force-cache"
      }
    ],
    "satelliteResources": {
      "cs": [
        {
          "virtualPath": "System.Private.ServiceModel.resources.wasm",
          "name": "System.Private.ServiceModel.resources.ssgo0uth7d.wasm",
          "hash": "sha256-9Extx7jLSejJiuOXzj2PuV3KfnRLJDrQwSbXu3OCUco=",
          "cache": "force-cache"
        },
        {
          "virtualPath": "System.Web.Services.Description.resources.wasm",
          "name": "System.Web.Services.Description.resources.rvyls6zubb.wasm",
          "hash": "sha256-18c+SWzdXycdb5K+QC55GwlzNCSnhGQX6Dj6NS/6aw8=",
          "cache": "force-cache"
        }
      ],
      "de": [
        {
          "virtualPath": "System.Private.ServiceModel.resources.wasm",
          "name": "System.Private.ServiceModel.resources.px25k18xnd.wasm",
          "hash": "sha256-HZZ4WGKPp81LCwnwa59pkUnuXMPf/vFIU1qijeS/WSA=",
          "cache": "force-cache"
        },
        {
          "virtualPath": "System.Web.Services.Description.resources.wasm",
          "name": "System.Web.Services.Description.resources.lhun4cxkzh.wasm",
          "hash": "sha256-GT789lhbIJ5IT1DOEZbqHhMT/u3Y73PtBW+K9YPxWjA=",
          "cache": "force-cache"
        }
      ],
      "es": [
        {
          "virtualPath": "System.Private.ServiceModel.resources.wasm",
          "name": "System.Private.ServiceModel.resources.o75p6fl9ki.wasm",
          "hash": "sha256-XCccBPN+zle4tjqB96QF93X4VkIwJfUuw3FkPjXoywo=",
          "cache": "force-cache"
        },
        {
          "virtualPath": "System.Web.Services.Description.resources.wasm",
          "name": "System.Web.Services.Description.resources.8rz1lrz6s5.wasm",
          "hash": "sha256-RJxvkQcH0a9aAWgKDLtPGTDtzviTR1XAwc4syhi/WhA=",
          "cache": "force-cache"
        }
      ],
      "fr": [
        {
          "virtualPath": "System.Private.ServiceModel.resources.wasm",
          "name": "System.Private.ServiceModel.resources.jpuo35j8tb.wasm",
          "hash": "sha256-d/iMN9zXpHlXGTmvZQKiPJqHOGFktXhKB4YO5VwO8FA=",
          "cache": "force-cache"
        },
        {
          "virtualPath": "System.Web.Services.Description.resources.wasm",
          "name": "System.Web.Services.Description.resources.79pa9ksasb.wasm",
          "hash": "sha256-W1f/iIMyh6srYI3PqVp9iSACUg+W/KKnNy2+2WE5cpY=",
          "cache": "force-cache"
        }
      ],
      "it": [
        {
          "virtualPath": "System.Private.ServiceModel.resources.wasm",
          "name": "System.Private.ServiceModel.resources.jd6wzcygis.wasm",
          "hash": "sha256-uUTSS4OBbuLJmoqO5H+oMengKbzDGeMBLoT5euxnBCw=",
          "cache": "force-cache"
        },
        {
          "virtualPath": "System.Web.Services.Description.resources.wasm",
          "name": "System.Web.Services.Description.resources.fchxe8bcbe.wasm",
          "hash": "sha256-D3Q3sv8RkRwBePyxXuqQ4bHYbMm6zPOtXejdBGVqDK8=",
          "cache": "force-cache"
        }
      ],
      "ja": [
        {
          "virtualPath": "System.Private.ServiceModel.resources.wasm",
          "name": "System.Private.ServiceModel.resources.jtdvwvjo06.wasm",
          "hash": "sha256-SXz/6toyyaTfhn1KP5IqSfjdWblfbJK6wG+ONBsyiwQ=",
          "cache": "force-cache"
        },
        {
          "virtualPath": "System.Web.Services.Description.resources.wasm",
          "name": "System.Web.Services.Description.resources.6u1bdt1w21.wasm",
          "hash": "sha256-Dq/GFXDRrOEdsj+mCxhcgTzoBIMHP/rps1aIoCjlAUA=",
          "cache": "force-cache"
        }
      ],
      "ko": [
        {
          "virtualPath": "System.Private.ServiceModel.resources.wasm",
          "name": "System.Private.ServiceModel.resources.szwe9c30fe.wasm",
          "hash": "sha256-eNg6Vb/ecCWWkrAxr2NCheDpWJ3MWqWNaOBvF0Jk4zc=",
          "cache": "force-cache"
        },
        {
          "virtualPath": "System.Web.Services.Description.resources.wasm",
          "name": "System.Web.Services.Description.resources.unc4a802gi.wasm",
          "hash": "sha256-5vxS1EmA+emNQczOjk+5AR/UC0Izgy67c5eUwv0BdIY=",
          "cache": "force-cache"
        }
      ],
      "pl": [
        {
          "virtualPath": "System.Private.ServiceModel.resources.wasm",
          "name": "System.Private.ServiceModel.resources.xouqndt3bj.wasm",
          "hash": "sha256-4XhBTZshhHs5vcvivDV0h1euyqb6txZ6eUoR9qDquTM=",
          "cache": "force-cache"
        },
        {
          "virtualPath": "System.Web.Services.Description.resources.wasm",
          "name": "System.Web.Services.Description.resources.dd5fqjr1l5.wasm",
          "hash": "sha256-D8ECsfA7POLStfi3L+3OwNPDq7k0rrxLiTbdzNv+4V8=",
          "cache": "force-cache"
        }
      ],
      "pt-BR": [
        {
          "virtualPath": "System.Private.ServiceModel.resources.wasm",
          "name": "System.Private.ServiceModel.resources.j1w1k6i205.wasm",
          "hash": "sha256-d2ThXx2oFCx31EPn8ljiiTiiOzubbUaVUuHISDdt3Mg=",
          "cache": "force-cache"
        },
        {
          "virtualPath": "System.Web.Services.Description.resources.wasm",
          "name": "System.Web.Services.Description.resources.ug12a2ae98.wasm",
          "hash": "sha256-7iWukFRBbcoeBXIlutzQm6Tp5aO2uOyMBvgob2axe0w=",
          "cache": "force-cache"
        }
      ],
      "ru": [
        {
          "virtualPath": "System.Private.ServiceModel.resources.wasm",
          "name": "System.Private.ServiceModel.resources.q0hw7crrps.wasm",
          "hash": "sha256-KqVqd/OzcOxXViCRlcYha9t2vnZuhxmhP0ABiN4hTjM=",
          "cache": "force-cache"
        },
        {
          "virtualPath": "System.Web.Services.Description.resources.wasm",
          "name": "System.Web.Services.Description.resources.t7detlwdyi.wasm",
          "hash": "sha256-aStmm/nt6G41AuvW7A6LpivVNxUyLDE+Aqii4UJKJKk=",
          "cache": "force-cache"
        }
      ],
      "tr": [
        {
          "virtualPath": "System.Private.ServiceModel.resources.wasm",
          "name": "System.Private.ServiceModel.resources.cf99xztob5.wasm",
          "hash": "sha256-CGvN8ZT61lXS+PFk0HjjaItIVtfRAAQWCXwQxPnm/As=",
          "cache": "force-cache"
        },
        {
          "virtualPath": "System.Web.Services.Description.resources.wasm",
          "name": "System.Web.Services.Description.resources.l6sj5kqlso.wasm",
          "hash": "sha256-beqRtYx03OFYQD7ay01fWth3KkYv3h5N1lL6Q5sMx9A=",
          "cache": "force-cache"
        }
      ],
      "zh-Hans": [
        {
          "virtualPath": "System.Private.ServiceModel.resources.wasm",
          "name": "System.Private.ServiceModel.resources.hw1sur3630.wasm",
          "hash": "sha256-odL54k/GdG5aoX1Ex9GefUumojWZ1Cpk3JDnMg3ff+M=",
          "cache": "force-cache"
        },
        {
          "virtualPath": "System.Web.Services.Description.resources.wasm",
          "name": "System.Web.Services.Description.resources.bbw2vopaon.wasm",
          "hash": "sha256-6QDpjz5sD5e2NCGDnnBHToXY8QV6h8mNKQpW6yZtLOE=",
          "cache": "force-cache"
        }
      ],
      "zh-Hant": [
        {
          "virtualPath": "System.Private.ServiceModel.resources.wasm",
          "name": "System.Private.ServiceModel.resources.uw7cjclvcm.wasm",
          "hash": "sha256-Dmb5h784wFggdA3X2gjWCzAs7Pilzhs6ugpa/uZ67ds=",
          "cache": "force-cache"
        },
        {
          "virtualPath": "System.Web.Services.Description.resources.wasm",
          "name": "System.Web.Services.Description.resources.5b3apbzvuz.wasm",
          "hash": "sha256-QeQfjOrhnFZ2j4necqOc8PaW4Sj7iOh01UAEZpSY+wY=",
          "cache": "force-cache"
        }
      ]
    }
  },
  "debugLevel": 0,
  "globalizationMode": "sharded",
  "runtimeConfig": {
    "runtimeOptions": {
      "configProperties": {
        "Windows.ApplicationModel.DataTransfer.DragDrop.ExternalSupport": true,
        "Uno.UI.EnableDynamicDataTemplateUpdate": false,
        "System.Diagnostics.Debugger.IsSupported": false,
        "System.Diagnostics.Metrics.Meter.IsSupported": false,
        "System.Diagnostics.Tracing.EventSource.IsSupported": false,
        "System.Globalization.Invariant": false,
        "System.TimeZoneInfo.Invariant": false,
        "System.Linq.Enumerable.IsSizeOptimized": true,
        "System.Net.Http.EnableActivityPropagation": false,
        "System.Net.Http.WasmEnableStreamingResponse": true,
        "System.Net.SocketsHttpHandler.Http3Support": false,
        "System.Reflection.Metadata.MetadataUpdater.IsSupported": false,
        "System.Resources.UseSystemResourceKeys": true,
        "System.Runtime.Serialization.EnableUnsafeBinaryFormatterSerialization": false,
        "System.Text.Encoding.EnableUnsafeUTF7Encoding": false,
        "System.Diagnostics.StackTrace.IsLineNumberSupported": false,
        "System.Runtime.CompilerServices.RuntimeFeature.IsMultithreadingSupported": false
      }
    }
  }
}/*json-end*/);export{po as default,mo as dotnet,go as exit};
