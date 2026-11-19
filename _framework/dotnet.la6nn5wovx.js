//! Licensed to the .NET Foundation under one or more agreements.
//! The .NET Foundation licenses this file to you under the MIT license.
//! This is generated file, see src/native/rollup.config.js

let e,t,o;const n={},r={},i={},s={},a={},l={},c={},u={},d={};function m(n,r){if(!Array.isArray(n))throw new Error("Expected internals to be an array");if(!Array.isArray(n[1]))throw new Error("Expected internal updates to be an array");if(void 0===e)e=n;else if(e!==n)throw new Error("Cannot replace internals");if(void 0===o&&(o=e[0]),"object"!=typeof o)throw new Error("Expected internals to have RuntimeAPI");void 0===t&&(t=o.Module);const i=e[1];r&&!i.includes(r)&&i.push(r);for(const t of e[1])t(e)}function f(){0===Object.keys(i).length&&e[3]&&function(e,t,o,n){const r={debug:e[0],info:e[1],warn:e[2],error:e[3]},i={check:e[4],fastCheck:e[5]},s={resolveRunMainPromise:e[6],rejectRunMainPromise:e[7],getRunMainPromise:e[8],createPromiseCompletionSource:e[9],isControllablePromise:e[10],getPromiseCompletionSource:e[11],isExited:e[12],isRuntimeRunning:e[13],addOnExitListener:e[14],abortStartup:e[15],quitNow:e[16],exit:e[17],normalizeException:e[18],fetchSatelliteAssemblies:e[19],fetchLazyAssembly:e[20]};Object.assign(n,s),Object.assign(t,r),Object.assign(o,i)}(e[3],n,r,i),0===Object.keys(s).length&&e[4]&&function(e,t){const o={bindJSImportST:e[0],invokeJSImportST:e[1],releaseCSOwnedObject:e[2],resolveOrRejectPromise:e[3],cancelPromise:e[4],invokeJSFunction:e[5],forceDisposeProxies:e[6],abortInteropTimers:e[7]};Object.assign(t,o)}(e[4],s),0===Object.keys(a).length&&e[5]&&function(e,t){const o={registerDllBytes:e[0],installVfsFile:e[1],loadIcuData:e[2],initializeCoreCLR:e[3],registerPdbBytes:e[4],instantiateWasm:e[5],instantiateWebcilModule:e[6]};Object.assign(t,o)}(e[5],a),0===Object.keys(u).length&&e[8]&&function(e,t){const o={utf16ToString:e[0],stringToUTF16:e[1],stringToUTF16Ptr:e[2],stringToUTF8Ptr:e[3],stringToUTF8:e[4],utf8ToStringRelaxed:e[5],zeroRegion:e[6],arrayBufferNeedsCopy:e[7],viewOrCopy:e[8],abortBackgroundTimers:e[9],abortPosix:e[10],getExitStatus:e[11],runBackgroundTimers:e[12]};Object.assign(t,o)}(e[8],u),0===Object.keys(l).length&&e[6]&&function(e,t){const o={SystemInteropJS_GetManagedStackTrace:e[0],SystemInteropJS_CallDelegate:e[1],SystemInteropJS_CompleteTask:e[2],SystemInteropJS_ReleaseJSOwnedObjectByGCHandle:e[3],SystemInteropJS_BindAssemblyExports:e[4],SystemInteropJS_CallJSExport:e[5]};Object.assign(t,o)}(e[6],l),0===Object.keys(c).length&&e[7]&&function(e,t){const o={getWasmMemory:e[0],getWasmTable:e[1],SystemJS_ScheduleDiagnosticServer:e[2],SystemJS_GetMethodName:e[3]};Object.assign(t,o)}(e[7],c),0===Object.keys(d).length&&e[9]&&function(e,t){const o={symbolicateStackTrace:e[0],installNativeSymbols:e[1],ds_rt_websocket_create:e[2],ds_rt_websocket_send:e[3],ds_rt_websocket_poll:e[4],ds_rt_websocket_recv:e[5],ds_rt_websocket_close:e[6],ds_rt_browser_performance_measure:e[7]};Object.assign(t,o)}(e[9],d)}const p={configLoaded:[]},h=globalThis,g="object"==typeof process&&"object"==typeof process.versions&&"string"==typeof process.versions.node,b="function"==typeof importScripts,y="object"==typeof window||b&&!g,v=!y&&!g,w="/",R={};function A(){return R}function E(){if(!R.mainAssemblyName)throw new Error("Loader configuration error: 'mainAssemblyName' is required.");if(!R.resources||!R.resources.coreAssembly||0===R.resources.coreAssembly.length)throw new Error("Loader configuration error: 'resources.coreAssembly' is required and must contain at least one assembly.")}function x(e){var t;void 0===(t=R).appendElementOnExit&&(t.appendElementOnExit=!1),void 0===t.logExitCode&&(t.logExitCode=!1),void 0===t.exitOnUnhandledError&&(t.exitOnUnhandledError=!1),void 0===t.loadAllSatelliteResources&&(t.loadAllSatelliteResources=!1),void 0===t.debugLevel&&(t.debugLevel=0),void 0===t.diagnosticTracing&&(t.diagnosticTracing=!1),void 0===t.virtualWorkingDirectory&&(t.virtualWorkingDirectory=w),void 0===t.maxParallelDownloads&&(t.maxParallelDownloads=16),void 0===t.enableDownloadRetry&&(t.enableDownloadRetry=!0),void 0===t.applicationEnvironment&&(t.applicationEnvironment="Production"),P(t),P(e),function(e,t){if(e===t||null==t)return e;(function(e,t){if(e===t||null==t)return e;t.hash=t.hash??e.hash,t.coreAssembly=[...e.coreAssembly,...t.coreAssembly||[]],t.assembly=[...e.assembly,...t.assembly||[]],t.lazyAssembly=[...e.lazyAssembly,...t.lazyAssembly||[]],t.corePdb=[...e.corePdb,...t.corePdb||[]],t.pdb=[...e.pdb,...t.pdb||[]],t.jsModuleNative=[...e.jsModuleNative,...t.jsModuleNative||[]],t.jsModuleDiagnostics=[...e.jsModuleDiagnostics,...t.jsModuleDiagnostics||[]],t.jsModuleRuntime=[...e.jsModuleRuntime,...t.jsModuleRuntime||[]],t.wasmSymbols=[...e.wasmSymbols,...t.wasmSymbols||[]],t.wasmNative=[...e.wasmNative,...t.wasmNative||[]],t.icu=[...e.icu,...t.icu||[]],t.vfs=[...e.vfs,...t.vfs||[]],t.appsettings=[...e.appsettings,...t.appsettings||[]],t.modulesAfterConfigLoaded=[...e.modulesAfterConfigLoaded,...t.modulesAfterConfigLoaded||[]],t.modulesAfterRuntimeReady=[...e.modulesAfterRuntimeReady,...t.modulesAfterRuntimeReady||[]],t.extensions={...e.extensions,...t.extensions||{}};for(const o in{...e.satelliteResources,...t.satelliteResources||{}})t.satelliteResources[o]=[...e.satelliteResources[o]||[],...t.satelliteResources[o]||[]];Object.assign(e,t)})(e.resources,t.resources),t.appendElementOnExit=void 0!==t.appendElementOnExit?t.appendElementOnExit:e.appendElementOnExit,t.logExitCode=void 0!==t.logExitCode?t.logExitCode:e.logExitCode,t.exitOnUnhandledError=void 0!==t.exitOnUnhandledError?t.exitOnUnhandledError:e.exitOnUnhandledError,t.loadAllSatelliteResources=void 0!==t.loadAllSatelliteResources?t.loadAllSatelliteResources:e.loadAllSatelliteResources,t.mainAssemblyName=void 0!==t.mainAssemblyName?t.mainAssemblyName:e.mainAssemblyName,t.virtualWorkingDirectory=void 0!==t.virtualWorkingDirectory?t.virtualWorkingDirectory:e.virtualWorkingDirectory,t.debugLevel=void 0!==t.debugLevel?t.debugLevel:e.debugLevel,t.diagnosticTracing=void 0!==t.diagnosticTracing?t.diagnosticTracing:e.diagnosticTracing,t.applicationEnvironment=void 0!==t.applicationEnvironment?t.applicationEnvironment:e.applicationEnvironment,t.environmentVariables={...e.environmentVariables,...t.environmentVariables},t.runtimeOptions=[...e.runtimeOptions,...t.runtimeOptions],t.runtimeConfig.runtimeOptions.configProperties={...e.runtimeConfig.runtimeOptions.configProperties,...t.runtimeConfig.runtimeOptions.configProperties};const o=e.resources;Object.assign(e,t),e.resources=o}(R,e)}function P(e){e.resources||(e.resources={}),function(e){e.coreAssembly||(e.coreAssembly=[]),e.assembly||(e.assembly=[]),e.lazyAssembly||(e.lazyAssembly=[]),e.corePdb||(e.corePdb=[]),e.pdb||(e.pdb=[]),e.jsModuleNative||(e.jsModuleNative=[]),e.jsModuleDiagnostics||(e.jsModuleDiagnostics=[]),e.jsModuleRuntime||(e.jsModuleRuntime=[]),e.wasmSymbols||(e.wasmSymbols=[]),e.wasmNative||(e.wasmNative=[]),e.icu||(e.icu=[]),e.modulesAfterConfigLoaded||(e.modulesAfterConfigLoaded=[]),e.modulesAfterRuntimeReady||(e.modulesAfterRuntimeReady=[]),e.satelliteResources||(e.satelliteResources={}),e.extensions||(e.extensions={}),e.vfs||(e.vfs=[]),e.appsettings||(e.appsettings=[])}(e.resources),e.environmentVariables||(e.environmentVariables={}),e.runtimeOptions||(e.runtimeOptions=[]),e.runtimeConfig?e.runtimeConfig.runtimeOptions?e.runtimeConfig.runtimeOptions.configProperties||(e.runtimeConfig.runtimeOptions.configProperties={}):e.runtimeConfig.runtimeOptions={configProperties:{}}:e.runtimeConfig={runtimeOptions:{configProperties:{}}}}const T={creatingRuntime:!1,nativeReady:!1,dotnetReady:!1,exitCode:void 0,exitReason:void 0,originalOnAbort:void 0,originalOnExit:void 0,onExitListeners:[]};function S(){return void 0!==T.exitCode}function O(){return T.dotnetReady&&!S()}function k(e){T.onExitListeners.push(e)}function C(e){T.originalOnExit&&T.originalOnExit(e),U(e,T.exitReason)}function j(e){T.originalOnAbort&&T.originalOnAbort(e||T.exitReason),U(1,e||T.exitReason)}function U(e,o){const r=o&&"object"==typeof o;e=r&&"number"==typeof o.status?o.status:void 0===e?-1:e;const a=r&&"string"==typeof o.message?o.message:""+o;o=r?o:function(e,t){const o=u.getExitStatus(),n="function"==typeof o?new o(e):new Error("Exit with code "+e+" "+t);return n.message=t,n.toString=()=>t,n}(e,a),o.status=e,o.message||(o.message=a);const l=!!o.silent,c=S();let d;d="function"==typeof o.getManageStack&&O()?o.getManageStack():o.stack||(new Error).stack||"",o.silent=!0;let m=!0;if(c||T.exitReason)l||n.debug(`dotnet.js exit() called after previous exit: ${a} ${d}`);else{T.exitReason=o;try{if(s&&s.abortInteropTimers&&s.abortInteropTimers(),u&&u.abortBackgroundTimers&&u.abortBackgroundTimers(),t.onAbort===j&&(t.onAbort=T.originalOnAbort),t.onExit===C&&(t.onExit=T.originalOnExit),T.creatingRuntime&&n.info(`Aborting startup, reason: ${o}`),!l){0!==T.onExitListeners.length||T.dotnetReady||(n.error("Exiting during runtime startup: ",a),n.debug(()=>d));for(const t of T.onExitListeners)try{t(e,o,l)||(m=!1)}catch{}}T.creatingRuntime&&i.abortStartup(o)}catch(e){n.warn("dotnet.js exit() failed: ",e)}T.exitCode=e,m&&L(e,o)}throw o}function L(e,o){throw T.dotnetReady&&(t.runtimeKeepalivePop(),u&&u.abortPosix&&u.abortPosix(e,o,T.dotnetReady)),0===e&&y||(v&&"function"==typeof h.quit&&h.quit(e),g&&globalThis.process&&"function"==typeof globalThis.process.exit&&(globalThis.process.exitCode=e,globalThis.process.exit(e))),o}const M=Symbol.for("wasm promise control");function D(e,t){let o=null;const n=new Promise((n,r)=>{o={isDone:!1,promise:null,resolve:t=>{o.isDone||(o.isDone=!0,n(t),e&&e())},reject:e=>{o.isDone||(o.isDone=!0,r(e),t&&t())},propagateFrom:e=>{e.then(o.resolve).catch(o.reject)}}});return o.promise=n,n[M]=o,o}function $(e){return e[M]}function N(e){return void 0!==e[M]}function z(e){return new Promise(t=>setTimeout(t,e))}const I=/*! webpackIgnore: true */import.meta.url,B=I.indexOf("?"),_=B>0?I.substring(B):"",W=(F=I.replace(/\\/g,"/").replace(/[?#].*/,"")).slice(0,F.lastIndexOf("/"))+"/";var F;function V(e,t=!1){let o;return o=G(e)?e:globalThis.URL?new globalThis.URL(e,W).href:W+e,t&&(o+=_),o}const J=/^[a-zA-Z][a-zA-Z\d+\-.]*?:\/\//,q=/[a-zA-Z]:[\\/]/;function G(e){return g||v?e.startsWith("/")||e.startsWith("\\")||-1!==e.indexOf("///")||q.test(e):J.test(e)}function H(e){return r.check("string"==typeof e,"url must be a string"),!G(e)&&0!==e.indexOf("./")&&0!==e.indexOf("../")&&globalThis.URL&&globalThis.document&&globalThis.document.baseURI?new URL(e,globalThis.document.baseURI).href:e}let K,Z,Q=!1;async function Y(e,t,o){try{if(g){const n=e.startsWith("file://");if(!n&&Q)return globalThis.fetch(e,t||{credentials:"same-origin"});n&&(e=Z.fileURLToPath(e));const r=await K.promises.readFile(e);return X(e,r,{status:200,statusText:"OK",headers:{"Content-Length":r.byteLength.toString(),"Content-Type":o||"application/octet-stream"}})}if(Q)return globalThis.fetch(e,t||{credentials:"same-origin"});if("function"==typeof read){const t=o&&(o.startsWith("application/json")||o.startsWith("text/plain")),n=read(e,t?"utf8":"binary");return X(e,n,{status:200,statusText:"OK",headers:{"Content-Length":t?n.length:n.byteLength.toString(),"Content-Type":o||"application/octet-stream"}})}}catch(t){return X(e,null,{status:500,statusText:"ERR28: "+t,headers:{}})}throw new Error("No fetch implementation available")}function X(e,t,o){if("function"==typeof globalThis.Response){const n=new Response(t,o);if(void 0===n.url)try{Object.defineProperty(n,"url",{value:e})}catch{}return n}return{ok:null!==t&&200===o.status,headers:{...o.headers,get:e=>o.headers[e]||null},url:e,arrayBuffer:()=>(r.check(null!==t&&t instanceof ArrayBuffer,"Response body is not a ArrayBuffer."),Promise.resolve(t)),json:()=>(r.check(null!==t&&"string"==typeof t,"Response body is not a string."),Promise.resolve(JSON.parse(t))),text:()=>{if("string"!=typeof t&&void 0!==globalThis.TextDecoder){const e=new globalThis.TextDecoder("utf-8");return Promise.resolve(e.decode(t||new Uint8Array))}return r.check(null!==t&&"string"==typeof t,"Response body is not a string."),Promise.resolve(t)}}}const ee=new Map;function te(){return[...ee.keys()].sort((e,t)=>e===t?0:"appsettings.json"===e?-1:"appsettings.json"===t?1:e.localeCompare(t))}function oe(e){return ee.get(e)}let ne,re,ie=0,se=0,ae=0;const le=new Set;let ce=null;const ue=D();let de;const me=D(),fe=D(()=>{m(e)});async function pe(e){return he(e)}async function he(e){const t=e;let o=await e.moduleExports;if(o&&(e.moduleExports=o),ae++,!o){if(t.name&&!e.resolvedUrl&&(e.resolvedUrl=V(t.name,!0)),t.behavior="js-module-dotnet","function"==typeof re){const o=De[t.behavior];r.check(o,`Unsupported asset behavior: ${t.behavior}`);const n=re(o,t.name,e.resolvedUrl,t.hash??"",t.behavior);r.check("string"==typeof n,"loadBootResourceCallback for JS modules must return string URL"),e.resolvedUrl=H(n)}if(!e.resolvedUrl)throw new Error("Invalid config, resources is not set");o=await import(e.resolvedUrl),e.moduleExports=o}return Le(t),o}async function ge(e){const t=await he(e),o=e.name||e.resolvedUrl||"unknown";try{return"function"==typeof t.onRuntimeConfigLoaded&&await t.onRuntimeConfigLoaded(R),t}catch(e){const t=e instanceof Error?e.message:String(e);throw new Error(`Failed to invoke 'onRuntimeConfigLoaded' on library initializer '${o}': ${t}`,{cause:e})}}async function be([e,t]){const n=await t,r=e.name||e.resolvedUrl||"unknown";try{"function"==typeof n.onRuntimeReady&&await n.onRuntimeReady(o)}catch(e){const t=e instanceof Error?e.message:String(e);throw new Error(`Failed to invoke 'onRuntimeReady' on library initializer '${r}': ${t}`,{cause:e})}}async function ye(e,t){const n=ce;let r,i;ce=null;try{const t=await a.instantiateWasm(de,e);r=t.instance,i=t.module}catch(e){throw o.exit(1,e),e}finally{Le(n)}t(r,i);const s=c.getWasmMemory();me.resolve(s)}async function ve(e){const t=e;let o;try{ae++,t.name&&!e.resolvedUrl&&(e.resolvedUrl=V(t.name)),t.behavior="icu",o=await Se(t)}finally{Le(t)}o&&(await fe.promise,a.loadIcuData(o))}async function we(e){const t=e;ae++,r.check(t.virtualPath,"Assembly asset must have virtualPath");const o=t.culture?`${t.culture}/${t.name}`:t.name;o&&!e.resolvedUrl&&(e.resolvedUrl=V(o));const n=t.virtualPath?.endsWith(".wasm")??!1;Me(t),n?await async function(e){try{e.behavior="webcil";const t=Oe(e),o=await me.promise,n=a.instantiateWebcilModule(t,o,e.virtualPath,e.tableSize,e.payloadSize);await n}finally{Le(e)}}(t):await async function(e){const t=e.virtualPath;let o;e.behavior="assembly";try{o=await Se(e)}finally{Le(e)}await fe.promise,o&&a.registerDllBytes(o,t,e.shortName)}(t)}async function Re(e){const t=e;let o;try{ae++,r.check(t.virtualPath,"PDB asset must have virtualPath"),t.name&&!e.resolvedUrl&&(e.resolvedUrl=V(t.name)),t.behavior="pdb",t.isOptional=t.isOptional||R.ignorePdbLoadErrors,Me(t),o=await Se(t)}finally{Le(t)}o&&(await fe.promise,a.registerPdbBytes(o,t.virtualPath,t.shortName))}async function Ae(e){const t=e;let o;try{ae++,t.name&&!e.resolvedUrl&&(e.resolvedUrl=V(t.name)),t.behavior="vfs",o=await Se(t)}finally{Le(t)}o&&(await fe.promise,a.installVfsFile(o,e))}async function Ee(e){const t=Object.assign(e,{behavior:"appsettings",cache:"no-cache",useCredentials:!0});try{ae++,e.resolvedUrl??(e.resolvedUrl=V(e.name));const o=await Se(t);o&&(function(e,t){ee.set(e,t)}(e.virtualPath,o),e.loadIntoVfs&&(await fe.promise,a.installVfsFile(o.slice(),e)))}finally{Le(t)}}async function xe(e){const t=R.resources?.satelliteResources;if(!t)return;const o=[];for(const n of e)if(Object.prototype.hasOwnProperty.call(t,n))for(const e of t[n])e.culture=n,o.push(we(e));await Promise.all(o)}function Pe(e){return e.substring(e.lastIndexOf("/")+1)}async function Te(e){const t=R.resources?.lazyAssembly;if(!t)throw new Error("No assemblies have been marked as lazy-loadable. Use the 'BlazorWebAssemblyLazyLoad' item group in your project file to enable lazy loading an assembly.");let o=e;if(e.endsWith(".dll")?o=e.substring(0,e.length-4):e.endsWith(".wasm")&&(o=e.substring(0,e.length-5)),le.has(o))return!1;const n=o+".dll",r=o+".wasm";let i=null;for(const e of t){const t=Pe(e.virtualPath);if(t===n||t===r){i=e;break}}if(!i)throw new Error(`${e} must be marked with 'BlazorWebAssemblyLazyLoad' item group in your project file to allow lazy-loading.`);if(await we(i),le.add(o),0!==R.debugLevel){const e=o+".pdb",n=R.resources?.pdb;let r;if(n)for(const t of n)if(Pe(t.virtualPath)===e){r=t;break}if(!r)for(const o of t)if(Pe(o.virtualPath)===e){r=o;break}r&&await Re(r)}return!0}async function Se(e){let t;r.check(e&&e.resolvedUrl,"Bad asset.resolvedUrl");try{t=await Oe(e)}catch(t){const o=t instanceof Error?t.message:String(t);throw new Error(`Failed to load resource '${e.name}' from '${e.resolvedUrl}': ${o}`,{cause:t})}if(!t.ok){if(e.isOptional)return n.warn(`Optional resource '${e.name}' failed to load from '${e.resolvedUrl}'. HTTP status: ${t.status} ${t.statusText}`),null;throw new Error(`Failed to load resource '${e.name}' from '${e.resolvedUrl}'. HTTP status: ${t.status} ${t.statusText}`)}const o=await(e.buffer||t.arrayBuffer());return new Uint8Array(o)}function Oe(e){if(v||g||e.resolvedUrl&&-1!==e.resolvedUrl.indexOf("file://"))return Ue(e);const t="dotnetwasm"===e.behavior&&"force-cache"===e.cache;return!R.enableDownloadRetry||Ne[e.behavior]&&!t?Ce(e):async function(e){let t;t=await r();const o="force-cache"===e.cache;if(t.ok||e.isOptional||!o&&ke.has(t.status))return t;if(o&&(e.cache="reload"),await ue.promise,429===t.status&&await z(100),n.debug(`Retrying download '${e.name}'`),t=await r(),t.ok||ke.has(t.status))return t;if(await z(100),n.debug(`Retrying download (2) '${e.name}' after delay`),t=await r(),t.ok)return t;throw new Error(`Failed to load resource '${e.name}' from '${e.resolvedUrl}' after multiple attempts. Last HTTP status: ${t.status} ${t.statusText}`);async function r(){let t;try{t=await Ce(e),t||(t=X(e.resolvedUrl,null,{status:404,statusText:"No response"}))}catch(o){t=X(e.resolvedUrl,null,{status:500,statusText:o.message||"Exception during fetch"})}return t}}(e)}const ke=new Set([400,401,403,404,405,406,409,410,411,413,414,415,422,426,501,505]);async function Ce(e){for(;ne&&!e.priority;)await ne.promise;try{!function(e){e.inprogress=!0,++ie,ie===R.maxParallelDownloads&&(n.debug("Throttling further parallel downloads"),ne=D())}(e);const t=Ue(e),o=await t;r.check(o,"Bad response in loadResourceThrottle");const i=o.ok&&("force-cache"===e.cache||"reload"===e.cache)&&"vfs"!==e.behavior&&"symbols"!==e.behavior;if(i&&"0"===o.headers.get("Content-Length"))throw new Error(`Failed to load resource '${e.name}': empty response`);if(!ze[e.behavior]){const t=await o.arrayBuffer();if(i&&0===t.byteLength)throw new Error(`Failed to load resource '${e.name}': empty response`);o.ok&&(e.buffer=t)}return o.ok&&Ie[e.behavior]||je(e),o}catch(t){throw je(e),t}}function je(e){if(r.check(e.inprogress,"Asset is not in progress in finishThrottling"),e.inprogress=!1,--ie,ne&&ie==R.maxParallelDownloads-1){n.debug("Resuming more parallel downloads");const e=ne;ne=void 0,e.resolve()}}async function Ue(e){const t=$e[e.behavior];if(r.check(t,`Unsupported asset behavior: ${e.behavior}`),e.buffer){const o=await e.buffer;return X(e.resolvedUrl,o,{status:200,statusText:"OK",headers:{"Content-Length":o.byteLength.toString(),"Content-Type":t}})}if(e.pendingDownload)return e.pendingDownload.response;if("function"==typeof re){const t=De[e.behavior];r.check(t,`Unsupported asset behavior: ${e.behavior}`);const o=re(t,e.name,e.resolvedUrl,e.hash??"",e.behavior);if("string"==typeof o)e.resolvedUrl=H(o);else if(null!==o&&"object"==typeof o)return o}r.check(e.resolvedUrl,"Bad asset.resolvedUrl");const o={};return e.cache?o.cache=e.cache:R.disableNoCacheFetch||(o.cache="no-cache"),e.useCredentials?o.credentials="include":!R.disableIntegrityCheck&&e.hash&&(o.integrity=e.hash),n.debug(`Attempting to download '${function(e){const t=e.indexOf("?");return t>=0?e.substring(0,t):e}(e.resolvedUrl)}'`),Y(e.resolvedUrl,o,t)}function Le(e){e.inprogress&&je(e),++se,p.downloadResourceProgress?.(se,ae),e.buffer=null,e.pendingDownload=void 0}function Me(e){r.check(e.virtualPath,"Asset must have virtualPath"),e.isCompositeImage||(e.virtualPath=e.virtualPath.replace(/\.wasm$/,".dll")),e.virtualPath=e.virtualPath.startsWith("/")?e.virtualPath:e.culture?`${w}${e.culture}/${e.virtualPath}`:w+e.virtualPath,e.shortName=e.virtualPath.startsWith(w)?e.virtualPath.substring(1):e.virtualPath.substring(e.virtualPath.lastIndexOf("/")+1)}const De={resource:"assembly",assembly:"assembly",pdb:"pdb",icu:"globalization",vfs:"configuration",appsettings:"configuration",manifest:"manifest",symbols:"pdb",dotnetwasm:"dotnetwasm",webcil:"assembly","js-module-dotnet":"dotnetjs","js-module-native":"dotnetjs","js-module-runtime":"dotnetjs"},$e={resource:"application/octet-stream",assembly:"application/octet-stream",pdb:"application/octet-stream",icu:"application/octet-stream",vfs:"application/octet-stream",appsettings:"application/json",manifest:"application/json",symbols:"text/plain; charset=utf-8",dotnetwasm:"application/wasm",webcil:"application/wasm"},Ne={dotnetwasm:1,symbols:1},ze={dotnetwasm:1,symbols:1,webcil:1},Ie={dotnetwasm:1,webcil:1};function Be(e){if(!y)return;const t=globalThis.document,o=t?.head;if(t&&o)for(const n of e)if(!n.resolvedUrl&&n.name&&(n.resolvedUrl=V(n.name,!0)),n.resolvedUrl){const e=t.createElement("link");e.rel="prefetch",e.href=n.resolvedUrl,e.as="script",o.appendChild(e)}}async function _e(e,t,o,n){if("function"==typeof re&&n&&o){const r=De[n];if(r){const i=re(r,o,e,t??"",n);if("string"==typeof i)e=H(i);else if(null!=i&&"object"==typeof i){const e=await i;return void("function"==typeof e?.arrayBuffer&&await e.arrayBuffer())}}}const r={};"appsettings"===n&&(r.cache="no-cache",r.credentials="include"),R.disableNoCacheFetch||(r.cache="no-cache"),!R.disableIntegrityCheck&&t&&(r.integrity=t);const i=await Y(e,r);i.ok&&await i.arrayBuffer()}const We=D();let Fe,Ve="none",Je=!1,qe=!1,Ge=[];async function He(o,i=!1){if(!R.resources||!R.resources.coreAssembly||!R.resources.coreAssembly.length)throw new Error("Invalid config, resources is not set");try{if(T.creatingRuntime=!0,o){if(Fe&&await Fe.promise,"intoMemory"===Ve||i&&"cacheOnly"===Ve)return;Fe=D()}if(Je&&!o){t.runtimeKeepalivePush(),await Ze(),await(p.dotnetReady?.());const e=tt(R.resources.modulesAfterRuntimeReady).map(e=>[e,he(e)]);return void await Promise.all([...Ge,...e].map(be))}const a=R.resources;let l=[];if(!qe){await async function(){if(r.check(await(async()=>{try{return new WebAssembly.Module(Uint8Array.from(atob("AGFzbQEAAAABBAFgAAADAgEAChABDgACaR9AAQMAAAsACxoL"),e=>e.codePointAt(0))),!0}catch(e){return!1}})(),"This browser/engine doesn't support WASM exception handling. Please use a modern version. See also https://learn.microsoft.com/aspnet/core/blazor/supported-platforms"),r.check(await(async()=>WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11])))(),"This browser/engine doesn't support WASM SIMD. Please use a modern version. See also https://learn.microsoft.com/aspnet/core/blazor/supported-platforms"),g){const e=parseInt(h.process.versions.node.split(".")[0],10);r.check(e>=18,`Node.js version ${h.process.versions.node} is not supported. Please use Node.js 18 or later.`)}else if(v&&"function"==typeof h.version&&h.d8){const e=h.version(),t=parseInt(e.split(".")[0],10);r.check(t>=14,"This V8 shell is too old. Please use a modern version.")}}();for(const e of[...p.configLoaded])await e(R);E(),l=tt(a.modulesAfterConfigLoaded).map(e=>[e,ge(e)]),await Promise.all(l.map(([,e])=>e)),t.out||(t.out=console.log.bind(console)),t.err||(t.err=console.error.bind(console)),t.print||(t.print=t.out),t.printErr||(t.printErr=t.err),await async function(){g&&(await async function(){return g&&!K&&(K=await import(/*! webpackIgnore: true */"fs")),K}(),await async function(){return g&&!Z&&(Z=await import(/*! webpackIgnore: true */"node:url")),Z}()),Q="function"==typeof globalThis.fetch,Q||(globalThis.fetch=Y)}(),qe=!0,Ge=l}const c=(s=R,(s.resources?.appsettings?.length?s.resources.appsettings:(s.appsettings||[]).map(e=>({name:e,virtualPath:e.substring(e.lastIndexOf("/")+1),loadIntoVfs:!0}))).filter(e=>"appsettings.json"===e.virtualPath||e.virtualPath===`appsettings.${s.applicationEnvironment}.json`));if(o&&i)return await async function(e){const t=R.resources;if(!t)return;const o=R.maxParallelDownloads??16,n=[],r=[];function i(e,t){!e.resolvedUrl&&e.name&&(e.resolvedUrl=V(e.name)),e.resolvedUrl&&e.name&&r.push({url:e.resolvedUrl,hash:e.hash,name:e.name,behavior:t})}if(t.coreAssembly&&t.coreAssembly.forEach(e=>i(e,"assembly")),t.assembly&&t.assembly.forEach(e=>i(e,"assembly")),t.vfs&&t.vfs.forEach(e=>i(e,"vfs")),e&&e.forEach(e=>i(e,"appsettings")),t.icu&&t.icu.forEach(e=>i(e,"icu")),t.wasmNative&&t.wasmNative.forEach(e=>i(e,"dotnetwasm")),t.corePdb&&t.corePdb.forEach(e=>i(e,"pdb")),t.pdb&&t.pdb.forEach(e=>i(e,"pdb")),t.wasmSymbols&&t.wasmSymbols.forEach(e=>i(e,"symbols")),R.loadAllSatelliteResources&&t.satelliteResources)for(const e of Object.keys(t.satelliteResources))for(const o of t.satelliteResources[e])!o.resolvedUrl&&o.name&&(o.resolvedUrl=V(`${e}/${o.name}`)),i(o,"assembly");Be([...t.jsModuleNative||[],...t.jsModuleRuntime||[],...t.jsModuleDiagnostics||[],...t.modulesAfterConfigLoaded||[],...t.modulesAfterRuntimeReady||[]]);let s=0;async function a(){for(;s<r.length;){const e=r[s++];try{await _e(e.url,e.hash,e.name,e.behavior)}catch{}}}const l=Math.min(o,r.length);for(let e=0;e<l;e++)n.push(a());await Promise.all(n)}(c),Ve="cacheOnly",void Fe?.resolve(void 0);a.jsModuleDiagnostics&&a.jsModuleDiagnostics.length>0&&((await pe(a.jsModuleDiagnostics[0])).dotnetInitializeModule(e),a.wasmSymbols&&a.wasmSymbols.length>0&&await async function(e){const t=e;let o;try{ae++,t.name&&!e.resolvedUrl&&(e.resolvedUrl=V(t.name)),t.behavior="symbols",t.isOptional=t.isOptional||R.ignorePdbLoadErrors,o=await async function(e){let t;r.check(e&&e.resolvedUrl,"Bad asset.resolvedUrl");try{t=await Oe(e)}catch(t){const o=t instanceof Error?t.message:String(t);throw new Error(`Failed to load resource '${e.name}' from '${e.resolvedUrl}': ${o}`,{cause:t})}if(!t.ok){if(e.isOptional)return n.warn(`Optional resource '${e.name}' failed to load from '${e.resolvedUrl}'. HTTP status: ${t.status} ${t.statusText}`),null;throw new Error(`Failed to load resource '${e.name}' from '${e.resolvedUrl}'. HTTP status: ${t.status} ${t.statusText}`)}return t.text()}(t)}finally{Le(t)}d.installNativeSymbols(o||"")}(a.wasmSymbols[0]));const u=pe(a.jsModuleNative[0]),m=pe(a.jsModuleRuntime[0]),f=function(e){ae++;const t=e;if(t.name&&!e.resolvedUrl&&(e.resolvedUrl=V(t.name)),t.behavior="dotnetwasm",t.priority=!0,!e.resolvedUrl)throw new Error("Invalid config, resources is not set");return ce=e,de=Oe(t),de}(a.wasmNative[0]),b=et(a.coreAssembly,we),w=function(){if(R.resources?.icu&&"invariant"!==R.globalizationMode){const e=R.applicationCulture||(y?globalThis.navigator&&globalThis.navigator.languages&&globalThis.navigator.languages[0]:Intl.DateTimeFormat().resolvedOptions().locale);R.applicationCulture||(R.applicationCulture=e),e&&void 0===R.environmentVariables.LANG&&(R.environmentVariables.LANG=`${e}.UTF-8`);const t=R.resources.icu;let o=null;if("custom"===R.globalizationMode){if(t.length>=1)return t[0].name}else e&&"all"!==R.globalizationMode?"sharded"===R.globalizationMode&&(o=function(e){const t=e.split("-")[0];return"en"===t||["fr","fr-FR","it","it-IT","de","de-DE","es","es-ES"].includes(e)?"icudt_EFIGS.dat":["zh","ko","ja"].includes(t)?"icudt_CJK.dat":"icudt_no_CJK.dat"}(e)):o="icudt.dat";if(o)for(let e=0;e<t.length;e++){const n=t[e];if(n.virtualPath===o)return n.name}}return R.globalizationMode="invariant",R.environmentVariables.DOTNET_SYSTEM_GLOBALIZATION_INVARIANT="1",null}(),A=et(a.icu,ve,e=>e.name===w),x=et(a.assembly,we),P=R.loadAllSatelliteResources&&a.satelliteResources?xe(Object.keys(a.satelliteResources)):Promise.resolve(),S=et(a.vfs,Ae),O=et(c,Ee),k=0!=R.debugLevel,C=et(a.corePdb,Re,()=>k),j=et(a.pdb,Re,()=>k);ue.resolve();let U=[];o?Be(tt(a.modulesAfterRuntimeReady)):U=tt(a.modulesAfterRuntimeReady).map(e=>[e,he(e)]);const L=(await u).dotnetInitializeModule(e);fe.propagateFrom(L);const M=(await m).dotnetInitializeModule(e);if(await fe.promise,T.nativeReady=!0,await b,await S,await O,await A,await f,o||(t.runtimeKeepalivePush(),await Ze()),await x,await P,await j,await C,await M,r.check(se===ae,`Not all assets were downloaded. Downloaded ${se} out of ${ae}`),o)return Ve="intoMemory",Je=!0,void Fe?.resolve(void 0);await(p.dotnetReady?.()),await Promise.all([...l,...U].map(be))}catch(e){Fe?.reject(e),U(1,e)}finally{T.creatingRuntime=!1}var s}function Ke(e){T.creatingRuntime&&fe.reject(e)}async function Ze(){r.check(!T.dotnetReady,"CoreCLR should be initialized just once");const e=a.initializeCoreCLR();if(0!=e){const t=new Error("Failed to initialize CoreCLR");We.reject(t),U(e,t)}T.dotnetReady=!0}function Qe(e){We.resolve(e)}function Ye(e){We.reject(e)}function Xe(){return We.promise}function et(e,t,o){if(!e)return Promise.resolve([]);const n=o?e.filter(o):e;return Promise.all(n.map(t))}function tt(e){return e||[]}let ot=[];async function nt(e,t){const o=[...R.resources?.modulesAfterConfigLoaded??[],...R.resources?.modulesAfterRuntimeReady??[]],n=[];for(const r of o)n.push(rt(r,e,t));await Promise.all(n)}async function rt(e,t,o){try{const n=await e.moduleExports;n&&(e.moduleExports=n),n&&"function"==typeof n[t]&&await n[t](...o)}catch(o){const r=e.name||e.resolvedUrl||"unknown",i=o instanceof Error?o.message:String(o),s=new Error(`Failed to invoke '${t}' on library initializer '${r}': ${i}`,{cause:o});throw n.warn(s.message),U(1,s),s}}function it(e,t){if(!e)throw new Error(`Assert failed: ${t}`)}function st(e,t){if(!e){const e=t();throw new Error(`Assert failed: ${e}`)}}const at="DOTNET: ";function lt(e,...t){R.diagnosticTracing&&("function"==typeof e&&(e=e()),console.debug(at+e,...t))}function ct(e,...t){console.info(at+e,...t)}function ut(e,...t){console.warn(at+e,...t)}function dt(e,t){t&&"object"==typeof t&&t.silent||console.error(at+e,mt(t))}function mt(e){let t,o="unknown exception";return e&&("object"==typeof e&&void 0===e.status&&(t=void 0!==e.stack?e.stack+"":(new Error).stack+""),o=e.message?e.message:"function"==typeof e.toString?e.toString():e+"",t?t.startsWith(o)?o=ft(t):o+="\n"+ft(t):o=ft(o)),o}function ft(e){return d.symbolicateStackTrace?d.symbolicateStackTrace(e):e}!function(){const e={INTERNAL:{getAppSettingsFiles:te,getAppSettingsBytes:oe},Module:{},runtimeId:void 0,runtimeBuildInfo:{productVersion:"12.0.0",gitHash:"7b0ddb6a9225564abe98d49d2ac1a8cdee09b2e3",buildConfiguration:"Release",wasmEnableThreads:!1,wasmEnableSIMD:!0,wasmEnableExceptionHandling:!0},getConfig:A,exit:U,invokeLibraryInitializers:nt},o=[e,[],R,void 0,void 0,void 0,void 0,void 0,void 0,void 0],s={getRunMainPromise:Xe,rejectRunMainPromise:Ye,resolveRunMainPromise:Qe,createPromiseCompletionSource:D,isControllablePromise:N,getPromiseCompletionSource:$,isExited:S,isRuntimeRunning:O,addOnExitListener:k,abortStartup:Ke,quitNow:L,exit:U,normalizeException:mt,fetchSatelliteAssemblies:xe,fetchLazyAssembly:Te};Object.assign(i,s);const a={debug:lt,info:ct,warn:ut,error:dt};Object.assign(n,a);const l={check:it,fastCheck:st};Object.assign(r,l);const c={instantiateWasm:ye};Object.assign(e.Module,c),o[3]=function(e,t,o){return[e.debug,e.info,e.warn,e.error,t.check,t.fastCheck,o.resolveRunMainPromise,o.rejectRunMainPromise,o.getRunMainPromise,o.createPromiseCompletionSource,o.isControllablePromise,o.getPromiseCompletionSource,o.isExited,o.isRuntimeRunning,o.addOnExitListener,o.abortStartup,o.quitNow,o.exit,o.normalizeException,o.fetchSatelliteAssemblies,o.fetchLazyAssembly]}(n,r,i),m(o,f),T.originalOnAbort=t.onAbort,T.originalOnExit=t.onExit,t.onAbort=j,t.onExit=C}(),await async function(){if(v&&"function"!=typeof globalThis.atob){const e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";globalThis.atob=t=>{const o=String(t).replace(/=+$/,"");let n="";for(let t=0,r=0,i=0;i<o.length;i++){const s=e.indexOf(o.charAt(i));-1!==s&&(r=t%4?64*r+s:s,t++%4&&(n+=String.fromCharCode(255&r>>(-2*t&6))))}return n}}if(g){if(globalThis.crypto||(globalThis.crypto={}),!globalThis.crypto.getRandomValues){let e;try{e=await import(/*! webpackIgnore: true */"node:crypto")}catch(e){}if(e){if(e.webcrypto)globalThis.crypto=e.webcrypto;else if(e.randomBytes){const t=t=>{t&&t.set(e.randomBytes(t.length))};globalThis.crypto.getRandomValues=t}}else globalThis.crypto.getRandomValues=()=>{throw new Error("Using node without crypto support. To enable current operation, either provide polyfill for 'globalThis.crypto.getRandomValues' or enable 'node:crypto' module.")}}globalThis.performance||(globalThis.performance=(await import(/*! webpackIgnore: true */"perf_hooks")).performance)}}();const pt=new class{withConfig(e){return x(e),this}withConfigSrc(e){return this}withApplicationArguments(...e){return ot=e,this}withEnvironmentVariable(e,t){return x({environmentVariables:{[e]:t}}),this}withEnvironmentVariables(e){return x({environmentVariables:e}),this}withVirtualWorkingDirectory(e){return x({virtualWorkingDirectory:e}),this}withDiagnosticTracing(e){return x({diagnosticTracing:e}),this}withDebugging(e){return x({debugLevel:e}),this}withMainAssembly(e){return x({mainAssemblyName:e}),this}withApplicationArgumentsFromQuery(){if(!globalThis.window)throw new Error("Missing window to the query parameters from");if(void 0===globalThis.URLSearchParams)throw new Error("URLSearchParams is supported");const e=new URLSearchParams(globalThis.window.location.search).getAll("arg");return this.withApplicationArguments(...e)}withApplicationEnvironment(e){return x({applicationEnvironment:e}),this}withApplicationCulture(e){return x({applicationCulture:e}),this}withDownloadResourceProgress(e){return p.downloadResourceProgress=e,this}withConfigLoaded(e){return e&&p.configLoaded.push(e),this}withDotnetReady(e){return p.dotnetReady=e,this}withResourceLoader(e){return re=e,this}withModuleConfig(e){return Object.assign(t,function(e){const t=e;if(!t||void 0===t.onConfigLoaded&&void 0===t.onDotnetReady&&void 0===t.onDownloadResourceProgress)return e;const{onConfigLoaded:o,onDotnetReady:n,onDownloadResourceProgress:r,...i}=e;return void 0!==o&&(p.configLoaded=[o]),void 0!==n&&(p.dotnetReady=n),void 0!==r&&(p.downloadResourceProgress=r),i}(e)),this}async download(e){try{return E(),He(!0,e??!1)}catch(e){throw U(1,e),e}}async create(){try{return E(),await He(!1),this.dotnetApi=o,this.dotnetApi}catch(e){throw U(1,e),e}}run(){return this.runMain()}async runMain(){try{return this.dotnetApi?E():await this.create(),this.dotnetApi.runMain(R.mainAssemblyName,ot)}catch(e){throw U(1,e),e}}async runMainAndExit(){try{return this.dotnetApi?E():await this.create(),this.dotnetApi.runMainAndExit(R.mainAssemblyName,ot)}catch(e){throw U(1,e),e}}};pt.withConfig(/*json-start*/{
  "mainAssemblyName": "BenchViewer",
  "resources": {
    "hash": "sha256-9aA/D9G2VmPkqpiomi2PW9m+3QmGbCzZOZ11n+m+9UA=",
    "jsModuleNative": [
      {
        "name": "dotnet.native.z0d2nj0t0e.js"
      }
    ],
    "jsModuleRuntime": [
      {
        "name": "dotnet.runtime.4nrw2318tg.js"
      }
    ],
    "wasmNative": [
      {
        "name": "dotnet.native.rzqx8m3qh9.wasm",
        "hash": "sha256-59aTus3ngz8ggp9E5+fERGAtoVxIgT0qyHa3FG1Sk6w=",
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
        "payloadSize": 2385488,
        "virtualPath": "System.Private.CoreLib.wasm",
        "name": "System.Private.CoreLib.sqiqkm8jke.wasm",
        "hash": "sha256-ZM3wnxCXkj5iO6cPypoOJqRHzjI2jqRcBci9cKN+U30=",
        "cache": "force-cache"
      }
    ],
    "assembly": [
      {
        "payloadSize": 277072,
        "virtualPath": "Microsoft.AspNetCore.Components.wasm",
        "name": "Microsoft.AspNetCore.Components.5z7557omsz.wasm",
        "hash": "sha256-oVjJ9PoVgzEVcnj79VdgNI/2epXkdMQFzkDmlQvf6ko=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 66128,
        "virtualPath": "Microsoft.AspNetCore.Components.Web.wasm",
        "name": "Microsoft.AspNetCore.Components.Web.o2fe5xqfbq.wasm",
        "hash": "sha256-MBOGkDPaWVrbVId7XhkRGIjoVoxv0ZLAClXYC9+BhtQ=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 143952,
        "virtualPath": "Microsoft.AspNetCore.Components.WebAssembly.wasm",
        "name": "Microsoft.AspNetCore.Components.WebAssembly.f2tkivctg1.wasm",
        "hash": "sha256-2QGEMP7JPQmwK/vNDycpd5/N3KxTs2py9iSmkfxeaNE=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 8784,
        "virtualPath": "Microsoft.Extensions.Configuration.wasm",
        "name": "Microsoft.Extensions.Configuration.si5jyh0x29.wasm",
        "hash": "sha256-TNf5+xJD/qa3WH8Ct913nVbnJ/kVQNxyyXf0LE88Yi4=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 12880,
        "virtualPath": "Microsoft.Extensions.Configuration.EnvironmentVariables.wasm",
        "name": "Microsoft.Extensions.Configuration.EnvironmentVariables.g8vqmjqls8.wasm",
        "hash": "sha256-oAJwRP0+h79E2GRSy0Hs7rLK/BNqGvG6VzL75ueHxvs=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 9808,
        "virtualPath": "Microsoft.Extensions.Configuration.Json.wasm",
        "name": "Microsoft.Extensions.Configuration.Json.tfi66817cr.wasm",
        "hash": "sha256-J6chhlkPDMSv4tMR7VpF+N12viwF0iDHLDGfh9x5jTU=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 54864,
        "virtualPath": "Microsoft.Extensions.DependencyInjection.wasm",
        "name": "Microsoft.Extensions.DependencyInjection.i90to5fah5.wasm",
        "hash": "sha256-ap2Z+mMqVdjVS/fbl2RK1DC5ziZna2JAFq8ZpjO2jw8=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 15440,
        "virtualPath": "Microsoft.Extensions.Diagnostics.wasm",
        "name": "Microsoft.Extensions.Diagnostics.3ljdoc7vzr.wasm",
        "hash": "sha256-mWMNVsV/cZf3T2OuwN17k6F55bTd6VQpfjQWipba6d4=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 17488,
        "virtualPath": "Microsoft.Extensions.Logging.wasm",
        "name": "Microsoft.Extensions.Logging.rr2xwtv968.wasm",
        "hash": "sha256-R3A5z+tDxFsjWva7OXRjx/nv7/2+dOiPeziIWoK86yc=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 47184,
        "virtualPath": "Microsoft.JSInterop.wasm",
        "name": "Microsoft.JSInterop.znkns0jnp0.wasm",
        "hash": "sha256-oasSiA1PwLq0akulLk/khAaZRxMsUqj8rR6opqVmYK8=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 11856,
        "virtualPath": "Microsoft.JSInterop.WebAssembly.wasm",
        "name": "Microsoft.JSInterop.WebAssembly.q4eoug5pcy.wasm",
        "hash": "sha256-dvRPBr31oWftruF/SgLkU5boi4iWp5pE8MYBXdMm0hs=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 6224,
        "virtualPath": "Microsoft.Extensions.Configuration.Abstractions.wasm",
        "name": "Microsoft.Extensions.Configuration.Abstractions.yxoo9z5son.wasm",
        "hash": "sha256-ugZ1yNDfE9eY3vNzmml10g2OJKaiGvxPPAVMZmjcG3g=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 26704,
        "virtualPath": "Microsoft.Extensions.DependencyInjection.Abstractions.wasm",
        "name": "Microsoft.Extensions.DependencyInjection.Abstractions.2pd0rvj0e2.wasm",
        "hash": "sha256-qrMdq9lCxziUyMqBTyraPtw0IYLkodW8s/hm3gp/F0c=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 8272,
        "virtualPath": "Microsoft.Extensions.Diagnostics.Abstractions.wasm",
        "name": "Microsoft.Extensions.Diagnostics.Abstractions.flms5al8fa.wasm",
        "hash": "sha256-ncGbxyPTejvBYFSwmFl/NXO9zyfWK9EMT9f1fTiEZhQ=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 5200,
        "virtualPath": "Microsoft.Extensions.Hosting.Abstractions.wasm",
        "name": "Microsoft.Extensions.Hosting.Abstractions.24kdn21whm.wasm",
        "hash": "sha256-7onjL+N8YPfzI98qSOHVq5TtnbF9rD4Gthlfzjz4FNc=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 28240,
        "virtualPath": "Microsoft.Extensions.Logging.Abstractions.wasm",
        "name": "Microsoft.Extensions.Logging.Abstractions.r0zsez2gcl.wasm",
        "hash": "sha256-S/rhPeGQsXs9yw0ynIQ1w4vDFl3rcHwzsgAZ3AcJgb4=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 26704,
        "virtualPath": "Microsoft.Extensions.Options.wasm",
        "name": "Microsoft.Extensions.Options.irp807jxdx.wasm",
        "hash": "sha256-biD2RsfsEFssgTQTYlOQ8lj5XqPNlpBzPL4vtWGOcVs=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 10832,
        "virtualPath": "Microsoft.Extensions.Primitives.wasm",
        "name": "Microsoft.Extensions.Primitives.h3lafiztwi.wasm",
        "hash": "sha256-TfCLKkbRaGYVhPMvjSlUjsApQLbqCie6raNRswi87Rw=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 5712,
        "virtualPath": "System.Collections.Concurrent.wasm",
        "name": "System.Collections.Concurrent.ugf3lbyfog.wasm",
        "hash": "sha256-DpJPF9tv4HJgYrU07o2yuUTFsGDHRqtujp1hkUvNmIs=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 54352,
        "virtualPath": "System.Collections.Immutable.wasm",
        "name": "System.Collections.Immutable.d192or5ze8.wasm",
        "hash": "sha256-QQ7kFp8hkGZuXiqWZqaPTa445014kNG4xz0v2DK1pNA=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 37456,
        "virtualPath": "System.Collections.wasm",
        "name": "System.Collections.lt1dckw3pk.wasm",
        "hash": "sha256-eWaHdTzDo5kE4ebqy7EcihD2xN5P29vW80wJh+//T7g=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 4688,
        "virtualPath": "System.ComponentModel.wasm",
        "name": "System.ComponentModel.ow89116gp7.wasm",
        "hash": "sha256-qMWBcNjQl3+7S6JGC1CCImyNcQQ9lXV+RZhOZEV8EH0=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 14416,
        "virtualPath": "System.Console.wasm",
        "name": "System.Console.0o0n1um4is.wasm",
        "hash": "sha256-4GMQ2EABuLLhz1X/du0V5SlbX/5pPGwALHUzSZKz9Qk=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 154704,
        "virtualPath": "System.Diagnostics.DiagnosticSource.wasm",
        "name": "System.Diagnostics.DiagnosticSource.3kc0ebyfgs.wasm",
        "hash": "sha256-bQYeJdLRmmfiYwpxLkE+FLo8UK1/7egdR4BwvSpIbfY=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 5712,
        "virtualPath": "System.IO.Pipelines.wasm",
        "name": "System.IO.Pipelines.elhgavjegl.wasm",
        "hash": "sha256-EpOPvj3cwpVfYMIhOVqKz5drqldBvOkz0oQN6KmSOVw=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 35408,
        "virtualPath": "System.Linq.wasm",
        "name": "System.Linq.bx3z2ybq9b.wasm",
        "hash": "sha256-Ycc8sSSpqWPlOxWEkDvT4PfHxl9Ii8cLspzJNxs7KFY=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 14928,
        "virtualPath": "System.Memory.wasm",
        "name": "System.Memory.1ncxbtvr10.wasm",
        "hash": "sha256-Pe2aZYRhRW5CT0o+lK24QPi12n1zfa4IKRaMk1Ih+uw=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 19024,
        "virtualPath": "System.Net.Http.Json.wasm",
        "name": "System.Net.Http.Json.1no6u9q8al.wasm",
        "hash": "sha256-w/tCewFLe1TGWnWwe87pxc/AOcy2BmJ8nyUJmUE0xjw=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 170576,
        "virtualPath": "System.Net.Http.wasm",
        "name": "System.Net.Http.kl0re2fnf9.wasm",
        "hash": "sha256-OP5TMPSU8HL8/K3iNfq0XIm1GpzUCNBG/klfafMT2YI=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 7760,
        "virtualPath": "System.Net.Primitives.wasm",
        "name": "System.Net.Primitives.25v7iz95ro.wasm",
        "hash": "sha256-ZieBch6wvOVXhzbXaFbbjeTpTSv6+TV4j/xnUJt8xag=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 65104,
        "virtualPath": "System.Private.Uri.wasm",
        "name": "System.Private.Uri.rgt8j1ggmz.wasm",
        "hash": "sha256-1SGRbK1luunJvEq/CQn9HvuZ9gbJ9QcIkmP4nNuydv4=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 43088,
        "virtualPath": "System.Runtime.InteropServices.JavaScript.wasm",
        "name": "System.Runtime.InteropServices.JavaScript.kzerp9ynxf.wasm",
        "hash": "sha256-oOEomk/LYYUM9fggJGBcwJ2QIuMgPHjBe3BQsMD96gY=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 4688,
        "virtualPath": "System.Runtime.InteropServices.wasm",
        "name": "System.Runtime.InteropServices.ciph8u6hel.wasm",
        "hash": "sha256-nIRodXdUGKuisYjH0jLe5NgZNYyXez4CYjzXT+bsbaw=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 8272,
        "virtualPath": "System.Runtime.wasm",
        "name": "System.Runtime.kio5lksbf1.wasm",
        "hash": "sha256-pG+XwH7Gm+PNol7uO5fcoIHZlf3lkqcthECo2Fd5asw=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 21584,
        "virtualPath": "System.Security.Cryptography.wasm",
        "name": "System.Security.Cryptography.phblopdrbu.wasm",
        "hash": "sha256-kyZ4DeSSvLvfXHmLfW4pTxybjaIrato8IpR21fWq0DU=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 30288,
        "virtualPath": "System.Text.Encodings.Web.wasm",
        "name": "System.Text.Encodings.Web.dkffimpryr.wasm",
        "hash": "sha256-c0k25keVMLGFFg8PDIzjQsgdzkFyRVZCWB0d4Qb0SVU=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 452176,
        "virtualPath": "System.Text.Json.wasm",
        "name": "System.Text.Json.8u032y98hz.wasm",
        "hash": "sha256-AMFFILASiGJaJfS8hp77QGt40bfioNd+4GFkpHwiq1M=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 15952,
        "virtualPath": "System.Text.RegularExpressions.wasm",
        "name": "System.Text.RegularExpressions.9y7h6zgsdw.wasm",
        "hash": "sha256-gXS3D54w7rcKycFBAmjcI7KTLDs0NmcMphOVsmFFs78=",
        "cache": "force-cache"
      },
      {
        "payloadSize": 452688,
        "virtualPath": "BenchViewer.wasm",
        "name": "BenchViewer.lcxpmn9of4.wasm",
        "hash": "sha256-FZfH4vEa7DkEncwXL1g2zSGCwOCTHyOab9F2kbMB8rw=",
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
        "System.Diagnostics.Metrics.Meter.IsSupported": true,
        "System.Diagnostics.Tracing.EventSource.IsSupported": true,
        "System.GC.Server": true,
        "System.Globalization.Invariant": false,
        "System.TimeZoneInfo.Invariant": false,
        "System.Linq.Enumerable.IsSizeOptimized": true,
        "System.Net.Http.EnableActivityPropagation": true,
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
}/*json-end*/);export{pt as dotnet,U as exit};
//# sourceMappingURL=dotnet.js.map
