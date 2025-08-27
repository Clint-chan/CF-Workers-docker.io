// _worker.js

// Docker镜像仓库主机地址
let hub_host = 'registry-1.docker.io';
// Docker认证服务器地址
const auth_url = 'https://auth.docker.io';

let 屏蔽爬虫UA = ['netcraft'];

// 根据主机名选择对应的上游地址
function routeByHosts(host) {
	const routes = {
		"quay": "quay.io",
		"gcr": "gcr.io",
		"k8s-gcr": "k8s.gcr.io",
		"k8s": "registry.k8s.io",
		"ghcr": "ghcr.io",
		"cloudsmith": "docker.cloudsmith.io",
		"nvcr": "nvcr.io",
		"test": "registry-1.docker.io",
	};

	if (host in routes) return [routes[host], false];
	else return [hub_host, true];
}

async function nginx() {
	return `<!DOCTYPE html>
	<html>
	<head><title>Welcome to nginx!</title>
	<style>body{width:35em;margin:0 auto;font-family:Tahoma,Verdana,Arial,sans-serif;}</style>
	</head>
	<body>
	<h1>Welcome to nginx!</h1>
	<p>If you see this page, the nginx web server is successfully installed and working.</p>
	</body>
	</html>`;
}

async function searchInterface() {
	return `<!DOCTYPE html>
	<html>
	<head>
		<title>Docker Hub 镜像搜索</title>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<style>
		body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;flex-direction:column;justify-content:center;align-items:center;min-height:100vh;margin:0;background:linear-gradient(135deg,#1a90ff 0%,#003eb3 100%);padding:20px;color:#fff;}
		.container{text-align:center;width:100%;max-width:800px;padding:20px;}
		.title{font-size:2.3em;margin-bottom:10px;font-weight:700;}
		.subtitle{font-size:1.1em;margin-bottom:25px;opacity:0.9;}
		.search-container{display:flex;width:100%;max-width:600px;margin:0 auto;height:55px;border-radius:12px;overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,0.15);}
		#search-input{flex:1;padding:0 20px;font-size:16px;border:none;outline:none;}
		#search-button{width:60px;background:#0066ff;border:none;cursor:pointer;color:white;}
		.tips{margin-top:20px;font-size:0.9em;opacity:0.8;}
		</style>
	</head>
	<body>
		<div class="container">
			<h1 class="title">Docker Hub 镜像搜索</h1>
			<p class="subtitle">快速查找、下载和部署 Docker 容器镜像</p>
			<div class="search-container">
				<input type="text" id="search-input" placeholder="输入关键词搜索镜像，如: nginx, mysql, redis...">
				<button id="search-button">搜索</button>
			</div>
			<p class="tips">基于 Cloudflare Workers 构建</p>
		</div>
		<script>
		function search(){const q=document.getElementById('search-input').value;if(q)window.location.href='/search?q='+encodeURIComponent(q);}
		document.getElementById('search-button').onclick=search;
		document.getElementById('search-input').onkeypress=e=>e.key==='Enter'&&search();
		</script>
	</body>
	</html>`;
}

// 简单直接的路由函数
function getTargetHost(pathname) {
	// Docker Hub Web UI 路径 -> hub.docker.com
	const hubPaths = [
		'/v2/repositories',
		'/v2/namespaces', 
		'/v2/users',
		'/v1/search',
		'/v1/repositories',
		'/search',
		'/_/',
		'/r/',
		'/u/',
		'/orgs/'
	];
	
	// 检查是否为 Hub 路径
	for (const path of hubPaths) {
		if (pathname.startsWith(path)) {
			return 'hub.docker.com';
		}
	}
	
	// /v1/ 路径 -> index.docker.io
	if (pathname.startsWith('/v1/')) {
		return 'index.docker.io';
	}
	
	// 其他所有路径（包括 /v2/ Registry API）-> registry-1.docker.io
	return 'registry-1.docker.io';
}

export default {
	async fetch(request, env, ctx) {
		const getReqHeader = (key) => request.headers.get(key);
		let url = new URL(request.url);
		const userAgentHeader = request.headers.get('User-Agent');
		const userAgent = userAgentHeader ? userAgentHeader.toLowerCase() : "null";
		if (env.UA) 屏蔽爬虫UA = 屏蔽爬虫UA.concat(await ADD(env.UA));
		const workers_url = `https://${url.hostname}`;

		// 获取请求参数中的 ns
		const ns = url.searchParams.get('ns');
		const hostname = url.searchParams.get('hubhost') || url.hostname;
		const hostTop = hostname.split('.')[0];

		let checkHost;
		if (ns) {
			if (ns === 'docker.io') {
				hub_host = 'registry-1.docker.io';
			} else {
				hub_host = ns;
			}
		} else {
			checkHost = routeByHosts(hostTop);
			hub_host = checkHost[0];
		}

		const fakePage = checkHost ? checkHost[1] : false;
		console.log(`请求路径: ${url.pathname}`);
		
		// 屏蔽爬虫
		if (屏蔽爬虫UA.some(fxxk => userAgent.includes(fxxk)) && 屏蔽爬虫UA.length > 0) {
			return new Response(await nginx(), {
				headers: { 'Content-Type': 'text/html; charset=UTF-8' }
			});
		}
		
		// 首页处理
		if (url.pathname === '/') {
			if (env.URL302) {
				return Response.redirect(env.URL302, 302);
			} else if (env.URL) {
				if (env.URL.toLowerCase() === 'nginx') {
					return new Response(await nginx(), {
						headers: { 'Content-Type': 'text/html; charset=UTF-8' }
					});
				} else {
					return fetch(new Request(env.URL, request));
				}
			} else if (fakePage) {
				return new Response(await searchInterface(), {
					headers: { 'Content-Type': 'text/html; charset=UTF-8' }
				});
			}
		}

		// 关键：根据路径直接确定目标主机
		const targetHost = getTargetHost(url.pathname);
		url.hostname = targetHost;
		
		console.log(`路径 ${url.pathname} -> 目标主机 ${targetHost}`);

		// 处理 /_/ 路径
		if (url.pathname.startsWith('/_/')) {
			url.pathname = '/r/' + url.pathname.substring(3);
			console.log(`路径转换: /_/ -> /r/, 新路径: ${url.pathname}`);
		}

		// 如果是 Hub 请求，直接转发
		if (targetHost === 'hub.docker.com' || targetHost === 'index.docker.io') {
			// 处理搜索参数
			if (url.searchParams.get('q')?.includes('library/') && url.searchParams.get('q') !== 'library/') {
				const search = url.searchParams.get('q');
				url.searchParams.set('q', search.replace('library/', ''));
			}
			
			console.log(`转发 Hub 请求到: ${url.toString()}`);
			return fetch(new Request(url, request));
		}

		// 以下是 Docker Registry API 处理逻辑
		console.log(`处理 Registry API 请求: ${url.pathname}`);

		// 修改包含 %2F 和 %3A 的请求
		if (!/%2F/.test(url.search) && /%3A/.test(url.toString())) {
			let modifiedUrl = url.toString().replace(/%3A(?=.*?&)/, '%3Alibrary%2F');
			url = new URL(modifiedUrl);
			console.log(`URL 修改: ${url}`);
		}

		// 处理 token 请求
		if (url.pathname.includes('/token')) {
			let token_parameter = {
				headers: {
					'Host': 'auth.docker.io',
					'User-Agent': getReqHeader("User-Agent"),
					'Accept': getReqHeader("Accept"),
					'Accept-Language': getReqHeader("Accept-Language"),
					'Accept-Encoding': getReqHeader("Accept-Encoding"),
					'Connection': 'keep-alive',
					'Cache-Control': 'max-age=0'
				}
			};
			let token_url = auth_url + url.pathname + url.search;
			return fetch(new Request(token_url, request), token_parameter);
		}

		// 修改 /v2/ 请求路径
		if (targetHost === 'registry-1.docker.io' && /^\/v2\/[^/]+\/[^/]+\/[^/]+$/.test(url.pathname) && !/^\/v2\/library/.test(url.pathname)) {
			url.pathname = '/v2/library/' + url.pathname.split('/v2/')[1];
			console.log(`Registry 路径修改: ${url.pathname}`);
		}

		// 构造请求参数
		let parameter = {
			headers: {
				'Host': targetHost,
				'User-Agent': getReqHeader("User-Agent"),
				'Accept': getReqHeader("Accept"),
				'Accept-Language': getReqHeader("Accept-Language"),
				'Accept-Encoding': getReqHeader("Accept-Encoding"),
				'Connection': 'keep-alive',
				'Cache-Control': 'max-age=0'
			},
			cacheTtl: 3600,
			redirect: 'manual' // 不自动跟随重定向
		};

		// 添加 Authorization 头
		if (request.headers.has("Authorization")) {
			parameter.headers.Authorization = getReqHeader("Authorization");
		}

		console.log(`发送请求到: ${url.toString()}`);

		// 发起请求并处理响应
		let original_response = await fetch(new Request(url, request), parameter);
		let response_headers = original_response.headers;
		let new_response_headers = new Headers(response_headers);
		let status = original_response.status;

		console.log(`响应状态: ${status}`);

		// 修改 Www-Authenticate 头
		if (new_response_headers.get("Www-Authenticate")) {
			let auth = new_response_headers.get("Www-Authenticate");
			let re = new RegExp(auth_url, 'g');
			new_response_headers.set("Www-Authenticate", response_headers.get("Www-Authenticate").replace(re, workers_url));
		}

		// 对于重定向响应，直接返回给客户端
		if (status >= 300 && status < 400) {
			console.log(`返回重定向 ${status} 给客户端`);
			return new Response(null, {
				status,
				headers: new_response_headers
			});
		}

		// 返回修改后的响应
		return new Response(original_response.body, {
			status,
			headers: new_response_headers
		});
	}
};

async function ADD(envadd) {
	var addtext = envadd.replace(/[	 |"'\r\n]+/g, ',').replace(/,+/g, ',');
	if (addtext.charAt(0) == ',') addtext = addtext.slice(1);
	if (addtext.charAt(addtext.length - 1) == ',') addtext = addtext.slice(0, addtext.length - 1);
	const add = addtext.split(',');
	return add;
}
