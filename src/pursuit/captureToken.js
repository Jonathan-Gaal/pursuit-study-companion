(() => {
  if (location.origin !== "https://platform.pursuit.org") return;
  const apiOrigin = "https://test-pilot-server.onrender.com";
  let sent = false;
  function report(url, authorization, status) {
    try {
      const target = new URL(url, location.href);
      if (
        sent ||
        target.origin !== apiOrigin ||
        !target.pathname.startsWith("/api/") ||
        status < 200 ||
        status >= 400
      )
        return;
      if (
        typeof authorization !== "string" ||
        !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/i.test(
          authorization,
        )
      )
        return;
      sent = true;
      window.webkit.messageHandlers.pursuitToken.postMessage(
        authorization.slice(7),
      );
    } catch {
      /* Do not expose request headers or credentials. */
    }
  }
  const originalFetch = window.fetch;
  window.fetch = async function (input, init) {
    const response = await originalFetch.apply(this, arguments);
    try {
      const request = input instanceof Request ? input : null;
      const headers = new Headers(init?.headers ?? request?.headers);
      report(
        request ? request.url : String(input),
        headers.get("Authorization"),
        response.status,
      );
    } catch {
      /* Keep normal platform requests unchanged. */
    }
    return response;
  };
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalHeader = XMLHttpRequest.prototype.setRequestHeader;
  const requests = new WeakMap();
  XMLHttpRequest.prototype.open = function (method, url) {
    requests.set(this, { url: String(url), authorization: null });
    this.addEventListener(
      "loadend",
      () => {
        const request = requests.get(this);
        if (request) report(request.url, request.authorization, this.status);
      },
      { once: true },
    );
    return originalOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    const request = requests.get(this);
    if (request && String(name).toLowerCase() === "authorization")
      request.authorization = value;
    return originalHeader.apply(this, arguments);
  };
})();
