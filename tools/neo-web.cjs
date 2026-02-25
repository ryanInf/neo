#!/usr/bin/env node
// neo-web.cjs — High-level "do something on a website" tool
// Combines Neo API execution with DOM evaluation for complete web app control.
//
// Usage:
//   node neo-web.cjs status                          # Show Neo status (domains, capture counts)
//   node neo-web.cjs open <url>                      # Open URL in Chrome
//   node neo-web.cjs read <tab-pattern>              # Extract readable content from page
//   node neo-web.cjs api <url> [options]              # Execute API call (delegates to neo-exec)
//   node neo-web.cjs schema <domain>                 # Generate API schema (delegates to neo-schema)
//   node neo-web.cjs captures [domain] [limit]       # List captures (delegates to neo-query)
//   node neo-web.cjs eval <js> --tab-url <pattern>   # Evaluate JS in page context
//   node neo-web.cjs tweet <text>                     # Post to X (Twitter)

const { execSync } = require('child_process');
const WebSocket = require('ws');
const path = require('path');

const CDP_URL = 'http://localhost:9222';
const TOOLS_DIR = path.dirname(__filename || __dirname);

function neo(tool, args) {
  const cmd = `node ${path.join(TOOLS_DIR, tool)} ${args}`;
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 30000, env: { ...process.env, NODE_PATH: process.env.NODE_PATH || '' } });
  } catch (e) {
    return e.stdout || e.stderr || e.message;
  }
}

async function cdpEval(tabPattern, expression) {
  const tabs = await (await fetch(`${CDP_URL}/json/list`)).json();
  const tab = tabPattern
    ? tabs.find(t => t.type === 'page' && t.url.includes(tabPattern))
    : tabs.find(t => t.type === 'page');
  if (!tab) throw new Error(`No tab matching "${tabPattern}"`);

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    const timer = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 15000);
    ws.on('open', () => {
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
      setTimeout(() => {
        ws.send(JSON.stringify({
          id: 2, method: 'Runtime.evaluate',
          params: { expression, awaitPromise: true, returnByValue: true }
        }));
      }, 200);
    });
    ws.on('message', raw => {
      const msg = JSON.parse(raw.toString());
      if (msg.id === 2) { clearTimeout(timer); ws.close(); resolve(msg.result?.result?.value); }
    });
    ws.on('error', err => { clearTimeout(timer); reject(err); });
  });
}

async function openUrl(url) {
  const res = await fetch(`${CDP_URL}/json/new?${url}`, { method: 'PUT' });
  const tab = await res.json();
  console.log(`Opened: ${tab.url}`);
}

async function readPage(tabPattern) {
  const result = await cdpEval(tabPattern, `
    (function() {
      // Extract main content, strip nav/footer/ads
      var main = document.querySelector('main, article, [role="main"], .content, #content');
      var el = main || document.body;
      
      // Get text content, clean up whitespace
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode: function(node) {
          var parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          var tag = parent.tagName.toLowerCase();
          if (['script','style','noscript','svg','path'].includes(tag)) return NodeFilter.FILTER_REJECT;
          if (parent.offsetHeight === 0 || parent.hidden) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      
      var texts = [];
      var node;
      while (node = walker.nextNode()) {
        var t = node.textContent.trim();
        if (t.length > 1) texts.push(t);
      }
      
      var title = document.title;
      var url = location.href;
      return 'Title: ' + title + '\\nURL: ' + url + '\\n\\n' + texts.join('\\n');
    })()
  `);
  console.log(result);
}

async function tweet(text) {
  const result = await cdpEval('x.com', `
    (async function() {
      var csrfToken = document.cookie.split('; ').find(c => c.startsWith('ct0=')).split('=')[1];
      var bearerToken = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
      
      var body = {
        variables: {
          tweet_text: ${JSON.stringify(text)},
          dark_request: false,
          media: { media_entities: [], possibly_sensitive: false },
          semantic_annotation_ids: []
        },
        features: {
          communities_web_enable_tweet_community_results_fetch: true,
          c9s_tweet_anatomy_moderator_badge_enabled: true,
          responsive_web_edit_tweet_api_enabled: true,
          graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
          view_counts_everywhere_api_enabled: true,
          longform_notetweets_consumption_enabled: true,
          responsive_web_twitter_article_tweet_consumption_enabled: true,
          tweet_awards_web_tipping_enabled: false,
          creator_subscriptions_quote_tweet_preview_enabled: false,
          longform_notetweets_rich_text_read_enabled: true,
          longform_notetweets_inline_media_enabled: true,
          articles_preview_enabled: true,
          rweb_video_timestamps_enabled: true,
          rweb_tipjar_consumption_enabled: true,
          responsive_web_graphql_exclude_directive_enabled: true,
          verified_phone_label_enabled: false,
          freedom_of_speech_not_reach_fetch_enabled: true,
          standardized_nudges_misinfo: true,
          tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
          responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
          responsive_web_graphql_timeline_navigation_enabled: true,
          responsive_web_enhance_cards_enabled: false
        },
        queryId: 'oB-5XsHNAbjvARJEc8CZFw'
      };
      
      var resp = await fetch('https://x.com/i/api/graphql/oB-5XsHNAbjvARJEc8CZFw/CreateTweet', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer ' + bearerToken,
          'x-twitter-auth-type': 'OAuth2Session',
          'x-csrf-token': csrfToken,
          'x-twitter-active-user': 'yes',
          'x-twitter-client-language': 'en'
        },
        credentials: 'include',
        body: JSON.stringify(body)
      });
      
      var data = await resp.json();
      if (data.errors) return 'Error: ' + data.errors.map(e => e.message).join(', ');
      var tweetResult = data.data?.create_tweet?.tweet_results?.result;
      if (tweetResult) return 'Tweet posted! ID: ' + tweetResult.rest_id;
      return 'Unexpected response: ' + JSON.stringify(data).slice(0, 200);
    })()
  `);
  console.log(result);
}

async function run() {
  const [,, cmd, ...args] = process.argv;
  
  switch (cmd) {
    case 'status':
      console.log(neo('neo-query.cjs', 'count'));
      console.log(neo('neo-query.cjs', 'domains'));
      break;
      
    case 'open':
      if (!args[0]) { console.error('Usage: neo-web open <url>'); process.exit(1); }
      await openUrl(args[0]);
      break;
      
    case 'read':
      if (!args[0]) { console.error('Usage: neo-web read <tab-pattern>'); process.exit(1); }
      await readPage(args[0]);
      break;
      
    case 'api':
      // Pass through to neo-exec with --auto-headers by default
      const execArgs = args.includes('--auto-headers') ? args.join(' ') : args.join(' ') + ' --auto-headers';
      console.log(neo('neo-exec.cjs', execArgs));
      break;
      
    case 'schema':
      if (!args[0]) { console.error('Usage: neo-web schema <domain>'); process.exit(1); }
      console.log(neo('neo-schema.cjs', args[0]));
      break;
      
    case 'captures':
      console.log(neo('neo-query.cjs', 'list ' + args.join(' ')));
      break;
      
    case 'eval':
      if (!args[0]) { console.error('Usage: neo-web eval "<js>" --tab-url <pattern>'); process.exit(1); }
      const tabIdx = args.indexOf('--tab-url');
      const tabPattern = tabIdx >= 0 ? args[tabIdx + 1] : null;
      const js = args.filter((a, i) => i !== tabIdx && i !== tabIdx + 1).join(' ');
      const result = await cdpEval(tabPattern, `
        (async function() {
          try { var r = await (${js}); return typeof r === 'object' ? JSON.stringify(r, null, 2) : String(r); }
          catch(e) { return 'Error: ' + e.message; }
        })()
      `);
      console.log(result);
      break;
      
    case 'tweet':
      if (!args[0]) { console.error('Usage: neo-web tweet "your text"'); process.exit(1); }
      await tweet(args.join(' '));
      break;
      
    default:
      console.log(`Neo Web — Control any website from the command line

Commands:
  status                          Show Neo capture status
  open <url>                      Open URL in Chrome
  read <tab-pattern>              Extract readable content from a page
  api <url> [--method X] [--body] Execute API call with auto auth headers
  schema <domain>                 Generate API schema from captures
  captures [domain] [limit]       List captured API calls
  eval "<js>" --tab-url <pattern> Evaluate JavaScript in page context
  tweet "<text>"                  Post to X (Twitter)
`);
  }
}

run().catch(err => { console.error('Error:', err.message); process.exit(1); });
