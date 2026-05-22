/**
 * FlowForge AI — Embeddable Form Widget
 * =====================================
 *
 * Usage on ABC's website:
 *
 *   <div id="flowforge-form"></div>
 *   <script src="https://flowforge-ai-psi.vercel.app/widget.js"
 *           data-token="wh_xxxxxxxxxxxxxxxxxx"
 *           data-api="https://flowforge-backend.onrender.com"
 *           data-target="#flowforge-form"></script>
 *
 * The script reads its own attributes (since `document.currentScript`
 * still works in browsers when the tag is parsed inline), fetches the
 * form schema from the backend, renders a styled form, and POSTs to the
 * webhook endpoint on submit.
 *
 * Deliberately a single ~5KB file with no build step so it can be
 * embedded by anyone who can paste HTML, including Wix / WordPress /
 * static sites where adding a build pipeline isn't an option.
 */
(function () {
  'use strict';

  var script = document.currentScript;
  if (!script) {
    // Fallback for older browsers — find the last script tag with our marker.
    var all = document.getElementsByTagName('script');
    for (var i = all.length - 1; i >= 0; i--) {
      if (all[i].src && all[i].src.indexOf('widget.js') !== -1) {
        script = all[i];
        break;
      }
    }
  }
  if (!script) {
    console.error('[FlowForge] widget.js could not locate its own <script> tag.');
    return;
  }

  var token = script.getAttribute('data-token');
  var apiBase = script.getAttribute('data-api') || inferApiFromScriptSrc(script.src);
  var targetSelector = script.getAttribute('data-target') || '#flowforge-form';
  var theme = (script.getAttribute('data-theme') || 'light').toLowerCase();

  if (!token) {
    console.error('[FlowForge] widget.js is missing required data-token attribute.');
    return;
  }

  // Use a Shadow DOM so our styles don't bleed into / get clobbered by
  // ABC's page styles. This is the same trick Intercom, Drift, etc. use.
  var mount = document.querySelector(targetSelector);
  if (!mount) {
    console.error('[FlowForge] widget.js could not find target selector ' + targetSelector);
    return;
  }
  var shadow = mount.attachShadow ? mount.attachShadow({ mode: 'open' }) : mount;
  injectStyles(shadow);

  var container = el('div', { class: 'ff-widget ff-theme-' + (theme === 'dark' ? 'dark' : 'light') });
  shadow.appendChild(container);
  renderLoading(container);

  fetch(apiBase.replace(/\/$/, '') + '/api/webhooks/' + token + '/schema')
    .then(function (r) {
      if (!r.ok) throw new Error('Form not active (' + r.status + ')');
      return r.json();
    })
    .then(function (schema) {
      renderForm(container, schema);
    })
    .catch(function (err) {
      renderError(container, err.message || 'Failed to load form.');
    });

  // --------------------------------------------------------------------------
  // Rendering
  // --------------------------------------------------------------------------
  function renderLoading(root) {
    root.innerHTML = '';
    root.appendChild(el('div', { class: 'ff-loading' }, 'Loading…'));
  }

  function renderError(root, msg) {
    root.innerHTML = '';
    root.appendChild(el('div', { class: 'ff-error' }, msg));
  }

  function renderForm(root, schema) {
    root.innerHTML = '';
    var card = el('div', { class: 'ff-card' });
    card.appendChild(el('div', { class: 'ff-title' }, schema.workflowName || 'Get in touch'));
    if (schema.workspaceName) {
      card.appendChild(el('div', { class: 'ff-subtitle' }, schema.workspaceName));
    }

    var form = el('form', { class: 'ff-form' });
    var fields = Array.isArray(schema.fields) && schema.fields.length ? schema.fields : [
      { key: 'email', label: 'Email', type: 'email', required: true },
    ];

    fields.forEach(function (f) {
      var wrap = el('label', { class: 'ff-field' });
      wrap.appendChild(el('span', { class: 'ff-label' }, f.label + (f.required ? ' *' : '')));
      var input;
      if (f.type === 'textarea') {
        input = el('textarea', { name: f.key, rows: 4, placeholder: f.placeholder || '' });
      } else if (f.type === 'select' && Array.isArray(f.options)) {
        input = el('select', { name: f.key });
        f.options.forEach(function (opt) {
          input.appendChild(el('option', { value: opt }, opt));
        });
      } else {
        input = el('input', {
          type: f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text',
          name: f.key,
          placeholder: f.placeholder || '',
        });
      }
      if (f.required) input.setAttribute('required', 'true');
      wrap.appendChild(input);
      form.appendChild(wrap);
    });

    var btn = el('button', { type: 'submit', class: 'ff-submit' }, 'Send');
    form.appendChild(btn);
    var status = el('div', { class: 'ff-status' });
    form.appendChild(status);

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      submit(form, fields, btn, status, root);
    });

    card.appendChild(form);
    card.appendChild(el('div', { class: 'ff-poweredby' }, 'Powered by FlowForge AI'));
    root.appendChild(card);
  }

  function submit(form, fields, btn, status, root) {
    var payload = {};
    fields.forEach(function (f) {
      var el = form.elements[f.key];
      if (el) payload[f.key] = el.value;
    });
    btn.disabled = true;
    btn.textContent = 'Sending…';
    status.className = 'ff-status';
    status.textContent = '';

    fetch(apiBase.replace(/\/$/, '') + '/api/webhooks/' + token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (r) {
        return r.json().then(function (body) { return { ok: r.ok, body: body }; });
      })
      .then(function (res) {
        if (!res.ok) {
          throw new Error((res.body && res.body.message) || 'Submission failed.');
        }
        renderThanks(root);
      })
      .catch(function (err) {
        status.classList.add('ff-status-error');
        status.textContent = err.message || 'Something went wrong.';
        btn.disabled = false;
        btn.textContent = 'Send';
      });
  }

  function renderThanks(root) {
    root.innerHTML = '';
    var card = el('div', { class: 'ff-card ff-thanks' });
    card.appendChild(el('div', { class: 'ff-checkmark' }, '✓'));
    card.appendChild(el('div', { class: 'ff-title' }, 'Thanks — we got it.'));
    card.appendChild(el('div', { class: 'ff-subtitle' }, 'A reply is on its way to your inbox.'));
    root.appendChild(card);
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------
  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
    }
    if (text != null) node.textContent = text;
    return node;
  }

  function inferApiFromScriptSrc(src) {
    // If the script is hosted at https://flowforge.com/widget.js then assume
    // the backend lives at the same origin — handy default when the customer
    // omits data-api.
    try {
      var u = new URL(src);
      return u.origin;
    } catch (e) {
      return '';
    }
  }

  function injectStyles(root) {
    var style = document.createElement('style');
    style.textContent =
      '.ff-widget{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#0f172a;}' +
      '.ff-theme-dark{color:#f1f5f9;}' +
      '.ff-card{max-width:480px;border:1px solid #e2e8f0;border-radius:12px;padding:24px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.05);}' +
      '.ff-theme-dark .ff-card{background:#0f172a;border-color:#1e293b;}' +
      '.ff-title{font-size:18px;font-weight:600;margin-bottom:4px;}' +
      '.ff-subtitle{font-size:13px;color:#64748b;margin-bottom:16px;}' +
      '.ff-theme-dark .ff-subtitle{color:#94a3b8;}' +
      '.ff-form{display:flex;flex-direction:column;gap:12px;}' +
      '.ff-field{display:flex;flex-direction:column;gap:4px;}' +
      '.ff-label{font-size:12px;font-weight:500;color:#334155;}' +
      '.ff-theme-dark .ff-label{color:#cbd5e1;}' +
      '.ff-form input,.ff-form textarea,.ff-form select{font-family:inherit;font-size:14px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;background:transparent;color:inherit;outline:none;transition:border-color .15s;}' +
      '.ff-form input:focus,.ff-form textarea:focus,.ff-form select:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,0.15);}' +
      '.ff-theme-dark .ff-form input,.ff-theme-dark .ff-form textarea,.ff-theme-dark .ff-form select{border-color:#334155;}' +
      '.ff-submit{margin-top:8px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-weight:600;font-size:14px;border:none;border-radius:6px;padding:10px 16px;cursor:pointer;transition:opacity .15s;}' +
      '.ff-submit:hover{opacity:.92;}' +
      '.ff-submit:disabled{opacity:.6;cursor:not-allowed;}' +
      '.ff-status{font-size:12px;margin-top:4px;color:#64748b;min-height:16px;}' +
      '.ff-status-error{color:#dc2626;}' +
      '.ff-poweredby{margin-top:16px;font-size:11px;color:#94a3b8;text-align:right;}' +
      '.ff-loading,.ff-error{padding:24px;text-align:center;color:#64748b;font-size:14px;}' +
      '.ff-error{color:#dc2626;}' +
      '.ff-thanks{text-align:center;}' +
      '.ff-checkmark{display:inline-grid;place-items:center;width:48px;height:48px;border-radius:50%;background:#10b981;color:#fff;font-size:24px;font-weight:700;margin:0 auto 12px;}';
    root.appendChild(style);
  }
})();
