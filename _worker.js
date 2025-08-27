// _worker.js

let 屏蔽爬虫UA = ['netcraft'];

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

export default {
	async fetch(request, env, ctx) {
		const getReqHeader = (key) => request.headers.get(key);
		let url = new URL(request.url);
		const userAgentHeader = request.headers.get('User-Agent');
		const userAgent = userAgentHeader ? userAgentHeader.toLowerCase() : "null";
		if (env.UA) 屏蔽爬虫UA = 屏蔽爬虫UA.concat(await ADD(env.UA));

		console.log(`收到请求: ${request.method} ${url.pathname}${url.search}`);
		
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
			} else {
				return new Response(await searchInterface(), {
					headers: { 'Content-Type': 'text/html; charset=UTF-8' }
				});
			}
		}

		// 简单粗暴的路由规则
		let targetHost;
		let targetUrl;

		// Docker Hub Web API 路径
		if (url.pathname.startsWith('/v2/namespaces/') || 
			url.pathname.startsWith('/v2/repositories/') || 
			url.pathname.startsWith('/v2/users/') ||
			url.pathname.startsWith('/v1/search') ||
			url.pathname.startsWith('/v1/repositories') ||
			url.pathname.startsWith('/search') ||
			url.pathname.startsWith('/_/') ||
			url.pathname.startsWith('/r/') ||
			url.pathname.startsWith('/u/') ||
			url.pathname.startsWith('/orgs/')) {
			
			targetHost = 'hub.docker.com';
			
			// 处理 /_/ 路径转换
			if (url.pathname.startsWith('/_/')) {
				url.pathname = '/r/' + url.pathname.substring(3);
			}
			
			targetUrl = `https://${targetHost}${url.pathname}${url.search}`;
			console.log(`Hub Web 请求 -> ${targetUrl}`);
			
		} else if (url.pathname.startsWith('/v1/')) {
			targetHost = 'index.docker.io';
			targetUrl = `https://${targetHost}${url.pathname}${url.search}`;
			console.log(`Index 请求 -> ${targetUrl}`);
			
		} else if (url.pathname.includes('/token')) {
			// Token 请求
			targetHost = 'auth.docker.io';
			targetUrl = `https://${targetHost}${url.pathname}${url.search}`;
			console.log(`Token 请求 -> ${targetUrl}`);
			
		} else {
			// Docker Registry API
			targetHost = 'registry-1.docker.io';
			
			// 修改 /v2/ 请求路径，添加 library/ 前缀
			if (targetHost === 'registry-1.docker.io' && 
				/^\/v2\/[^/]+\/[^/]+\/[^/]+$/.test(url.pathname) && 
				!/^\/v2\/library/.test(url.pathname)) {
				url.pathname = '/v2/library/' + url.pathname.split('/v2/')[1];
				console.log(`Registry 路径修改: ${url.pathname}`);
			}
			
			targetUrl = `https://${targetHost}${url.pathname}${url.search}`;
			console.log(`Registry API 请求 -> ${targetUrl}`);
		}

		// 构建新的请求
		const newRequest = new Request(targetUrl, {
			method: request.method,
			headers: request.headers,
			body: request.body,
			redirect: 'manual' // 重要：不自动跟随重定向
		});

		// 修改 Host 头
		const newHeaders = new Headers(newRequest.headers);
		newHeaders.set('Host', targetHost);

		const finalRequest = new Request(targetUrl, {
			method: request.method,
			headers: newHeaders,
			body: request.body,
			redirect: 'manual'
		});

		console.log(`发送请求到: ${targetUrl}`);
		console.log(`Host 头: ${targetHost}`);

		try {
			// 直接获取响应
			const response = await fetch(finalRequest);
			console.log(`响应状态: ${response.status}`);

			// 创建新的响应头
			const responseHeaders = new Headers(response.headers);
			
			// 添加 CORS 头
			responseHeaders.set('Access-Control-Allow-Origin', '*');
			responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
			responseHeaders.set('Access-Control-Allow-Headers', '*');

			// 如果是重定向，直接返回给客户端
			if (response.status >= 300 && response.status < 400) {
				console.log(`返回重定向 ${response.status} 给客户端`);
				return new Response(null, {
					status: response.status,
					headers: responseHeaders
				});
			}

			// 返回响应
			return new Response(response.body, {
				status: response.status,
				headers: responseHeaders
			});

		} catch (error) {
			console.error(`请求失败: ${error.message}`);
			return new Response(`代理请求失败: ${error.message}`, {
				status: 500,
				headers: {
					'Content-Type': 'text/plain; charset=utf-8',
					'Access-Control-Allow-Origin': '*'
				}
			});
		}
	}
};

async function ADD(envadd) {
	var addtext = envadd.replace(/[	 |"'\r\n]+/g, ',').replace(/,+/g, ',');
	if (addtext.charAt(0) == ',') addtext = addtext.slice(1);
	if (addtext.charAt(addtext.length - 1) == ',') addtext = addtext.slice(0, addtext.length - 1);
	const add = addtext.split(',');
	return add;
}
