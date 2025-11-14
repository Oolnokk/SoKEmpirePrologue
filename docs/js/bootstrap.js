(function () {
  function supportsModernSyntax() {
    try {
      // Optional chaining and nullish coalescing
      // eslint-disable-next-line no-new-func
      new Function('var obj={foo:{bar:1}}; return obj?.foo?.bar ?? 0;');
      // Logical assignment
      // eslint-disable-next-line no-new-func
      new Function('var state={}; state.config ||= {}; return state.config;');
    } catch (error) {
      return false;
    }
    return true;
  }

  function showLegacyBrowserNotice() {
    var message = document.createElement('div');
    message.className = 'legacy-browser-notice';
    message.innerHTML = '<strong>Your browser is out of date.</strong> This demo uses modern JavaScript features that are unavailable in your current browser. Please update to a newer version of Chrome, Firefox, Safari, or Edge to continue.';

    var attach = function () {
      document.body.insertBefore(message, document.body.firstChild || null);
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', attach);
    } else {
      attach();
    }
  }

  function loadAppModule() {
    var script = document.createElement('script');
    script.type = 'module';
    script.src = './js/app.js?v=20';
    document.head.appendChild(script);
  }

  if (supportsModernSyntax()) {
    loadAppModule();
  } else {
    showLegacyBrowserNotice();
  }
})();
