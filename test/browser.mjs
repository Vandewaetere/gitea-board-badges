// =========================================================================================================================
// gitea-board-badges — browser part of the end-to-end test
// =========================================================================================================================
//
// Started by test/test.sh inside Microsoft's official Playwright container, after test.sh has started a throwaway Gitea
// and filled it with test data:
//   repository tester/demo with four issues
//     #1 "First issue"     -> column To Do
//     #2 "Second issue"    -> column In Progress
//     #3 "Third issue"     -> column Done
//     #4 "Not on a board"  -> on no board
// Gitea is set to show only 2 issues per page, so the list has 2 pages. Gitea sorts newest first:
//   page 1: #4 "Not on a board", #3 "Third issue"      page 2: #2 "Second issue", #1 "First issue"
// That lets the test check that the status filter also finds issues that are on another page than the one that is open.
//
// This script drives a real Chromium browser like a person would: it logs in, opens pages, clicks the dropdown, and then
// checks what is visible on the screen. Every check prints one line starting with "ok" or "FAIL". At the end the script
// exits with 0 when everything passed and 1 when anything failed, which test.sh passes on as its own result.
//
// The test user has Gitea's default language (English), so the script's English texts are expected ("All",
// "No board" ...). At the end the test switches the user to Dutch and checks the Dutch texts once.
// =========================================================================================================================
import { chromium } from 'playwright';

// Address of the test Gitea, passed in by test.sh (e.g. http://gbb_gitea_1234:3000).
const BASE = process.env.BASE;

// The expected badge per issue title; null = no badge expected. These are checked on all rows the script has in the
// list, including the hidden rows it copied from the other page.
const expected = {'First issue': 'To Do', 'Second issue': 'In Progress', 'Third issue': 'Done', 'Not on a board': null};

// Start a browser with a fixed window size, so the screenshots always look the same.
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1100, height: 650}});

// Log in as the test user through Gitea's normal login form, just like a person. (The password is throwaway test data
// of the temporary test Gitea started by test.sh; it exists nowhere else.) The script under test uses the browser
// login (cookie) to read the boards, so this is a real part of what is being tested.
await page.goto(`${BASE}/user/login`);
await page.fill('#user_name', 'tester');
await page.fill('#password', 'Test-12345!');
await page.click('form button.primary');
await page.waitForLoadState('load');

// Number of failed checks; every check adds 1 when it fails.
let failed = 0;

// Screenshot of the board itself, for the README: this is where the columns and their colours come from.
// A wider window here, so all three columns fit on the screenshot.
await page.setViewportSize({width: 1280, height: 520});
await page.goto(`${BASE}/tester/demo/projects/1`);
await page.waitForLoadState('load');
await page.screenshot({path: '/out/board.png'});
await page.setViewportSize({width: 1100, height: 650});

// -------------------------------------------------------------------------------------------------------------------------
// Part 1: badges, in the issue list of the repository and in the global /issues overview.
// -------------------------------------------------------------------------------------------------------------------------
for (const [path, name] of [['/tester/demo/issues', 'repo'], ['/issues', 'dashboard']]) {
  await page.goto(BASE + path);
  await page.waitForLoadState('load');
  // The script needs a moment after the page has loaded: it downloads the boards and the other page of the list. The
  // dropdown is added last, when everything is loaded, so wait (up to 10 seconds) for the dropdown. If it never comes,
  // carry on: the checks below will then report the failure.
  await page.waitForSelector('.board-column-filter', {timeout: 10000}).catch(() => {});

  // Read the list as it is now shown: for every row its title and the text of its badge (null if it has none).
  const got = await page.$$eval('#issue-list > .item', (items) => Object.fromEntries(items.map((i) => [
    i.querySelector('a.list-item-large-title').textContent.trim(),
    i.querySelector('.board-column-badge')?.textContent ?? null])));

  // Compare with what we expect, one line per issue.
  for (const [title, column] of Object.entries(expected)) {
    const ok = got[title] === column;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${title} -> ${got[title]} (expected ${column})`);
  }

  // Screenshot for the README and for a visual check by a person (test/out/repo.png and test/out/dashboard.png).
  await page.screenshot({path: `/out/${name}.png`});
}

// -------------------------------------------------------------------------------------------------------------------------
// Part 2: the "Status" dropdown.
// -------------------------------------------------------------------------------------------------------------------------

// Titles of the rows that are visible right now (hidden rows have no offsetParent), sorted so the order does not matter.
const visible = () => page.$$eval('#issue-list > .item', (items) => items.filter((i) => i.offsetParent !== null)
  .map((i) => i.querySelector('a.list-item-large-title').textContent.trim()).sort());

// The rows Gitea itself puts on page 1 of the repository list (newest first, 2 per page).
const page1 = ['Not on a board', 'Third issue'];

// Are Gitea's own page buttons visible? They must be hidden while a status filter is active.
const pagerVisible = () => page.$eval('.page.buttons', (p) => p.offsetParent !== null).catch(() => null);

// One check: are exactly the rows in "want" visible? Also prints the "#..." part of the address, so the output shows
// whether the filter was written into the address correctly.
const check = async (label, want) => {
  const got = await visible();
  const ok = JSON.stringify(got) === JSON.stringify([...want].sort());
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} filter ${label}: ${got.join(', ')} | ${new URL(page.url()).hash || '(no hash)'}`);
};

// One check: are Gitea's page buttons visible (want = true) or hidden (want = false)?
const checkPager = async (label, want) => {
  const got = await pagerVisible();
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} page buttons ${label}: ${got ? 'visible' : 'hidden'}`);
};

// Choose an entry in the dropdown like a person: click the button to open it, then click the entry. The value '' means
// "All".
const click = async (column) => {
  await page.click('.board-column-filter');
  await page.click(`.board-column-filter-item[data-column="${column}"]`);
};

// Open the repository list and wait until the dropdown has been added. Meanwhile count how many list pages the script
// downloads: the list has 2 pages and page 1 is open, so it must fetch exactly 1 other page (page 2), not more.
const listRequests = [];
const onRequest = (r) => { const u = new URL(r.url()); if (u.pathname === '/tester/demo/issues' && u.searchParams.has('page')) listRequests.push(u.search); };
page.on('request', onRequest);
await page.goto(`${BASE}/tester/demo/issues`);
await page.waitForSelector('.board-column-filter', {timeout: 10000}).catch(() => {});
page.off('request', onRequest);
{
  const ok = listRequests.length === 1 && listRequests[0].includes('page=2');
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} other pages fetched: ${listRequests.join(' ') || '(none)'}`);
}
// The heading of the dropdown must say that it covers all pages.
{
  const header = await page.$eval('.board-column-filter .menu .header', (h) => h.textContent);
  const ok = header === 'Status on the board (all pages)';
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} heading: ${header}`);
}

// Information lines (not counted as checks): is the dropdown right after Gitea's "Project" filter, and which entries does
// it have (name + count)? A person reading the output can see at a glance whether the layout is as intended.
console.log('dropdown in filter bar:', await page.$eval('.board-column-filter', (d) => !!d.previousElementSibling?.classList.contains('project-filter')));
await page.click('.board-column-filter');
console.log('items:', (await page.$$eval('.board-column-filter-item', (b) => b.map((x) => x.textContent.trim().replace(/\s+/g, ' ')))).join(' | '));
await page.waitForTimeout(300);   // let the opening animation finish
await page.screenshot({path: '/out/filter-open.png'});   // the open dropdown, used in the README

// Without a filter: exactly Gitea's own page 1, with Gitea's page buttons.
await page.keyboard.press('Escape');
await check('no filter = page 1', page1);
await checkPager('without filter', true);

// Choose "To Do": only issue #1 may be visible, although it is on page 2 and page 1 is open. The address must end in
// #status=To%20Do, and Gitea's page buttons must be hidden.
await click('To Do');
await check('To Do (on page 2)', ['First issue']);
await checkPager('with filter', false);
console.log('label:', await page.$eval('.board-column-filter > .text', (t) => t.textContent));   // button now says "To Do"
await page.screenshot({path: '/out/filter.png'});

// Reload the page: the filter comes from the address, so it must still be active.
await page.reload();
await page.waitForSelector('.board-column-filter');
await check('To Do after reload', ['First issue']);

// "No board": only the issue that is on no board.
await click('No board');
await check('No board', ['Not on a board']);
await page.screenshot({path: '/out/filter-noboard.png'});

// First another column, then "All": back to Gitea's own page 1 with its page buttons, and the "#..." part removed
// from the address.
await click('Done');
await click('');
await check('All = page 1', page1);
await checkPager('after All', true);

// Page 2 open, filter "Done": issue #3 comes from page 1.
await page.goto(`${BASE}/tester/demo/issues?page=2#status=Done`);
await page.waitForSelector('.board-column-filter', {timeout: 10000}).catch(() => {});
await check('page 2 with #status=Done', ['Third issue']);

// A link that already contains a filter, on the global /issues page: only issue #2 (In Progress).
await page.goto(`${BASE}/issues#status=In%20Progress`);
await page.waitForSelector('.board-column-filter', {timeout: 10000}).catch(() => {});
await check('/issues with #status=In Progress', ['Second issue']);
await page.screenshot({path: '/out/dashboard-filter.png'});
console.log('label:', await page.$eval('.board-column-filter > .text', (t) => t.textContent));

// An old link from an earlier version, when the dropdown was called "Kolom" (#kolom=...): must still work, and is rewritten to #status=.
await page.goto(`${BASE}/tester/demo/issues#kolom=Done`);
await page.waitForSelector('.board-column-filter', {timeout: 10000}).catch(() => {});
await check('old link #kolom=Done', ['Third issue']);

// Without a filter the button must simply say "Status".
await page.goto(`${BASE}/tester/demo/issues`);
await page.waitForSelector('.board-column-filter', {timeout: 10000}).catch(() => {});
const idle = await page.$eval('.board-column-filter > .text', (t) => t.textContent);
if (idle !== 'Status') failed++;
console.log(`${idle === 'Status' ? 'ok  ' : 'FAIL'} button without filter: ${idle}`);

// -------------------------------------------------------------------------------------------------------------------------
// Part 3: Dutch texts. Switch the test user's Gitea language to Dutch (Settings -> Appearance, done here through the same
// form Gitea's settings page uses) and check that the dropdown speaks Dutch.
// -------------------------------------------------------------------------------------------------------------------------
await page.goto(`${BASE}/user/settings/appearance`);
await page.evaluate(async () => {
  const body = new URLSearchParams({_csrf: window.config.csrfToken, language: 'nl-NL'});
  await fetch('/user/settings/appearance/language', {method: 'POST', body});
});
await page.goto(`${BASE}/tester/demo/issues`);
await page.waitForSelector('.board-column-filter', {timeout: 10000}).catch(() => {});
{
  const all = await page.$eval('.board-column-filter-item[data-column=""]', (x) => x.textContent.trim()).catch(() => '');
  const none = await page.$('.board-column-filter-item[data-column="Geen bord"]');
  const header = await page.$eval('.board-column-filter .menu .header', (h) => h.textContent).catch(() => '');
  const ok = all.startsWith('Alle') && !!none && header === "Status op het bord (alle pagina's)";
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} Dutch: ${header} | ${all} | ${none ? 'Geen bord' : '(Geen bord missing)'}`);
  // Screenshot of the open Dutch dropdown, for the README.
  await page.click('.board-column-filter');
  await page.waitForTimeout(300);
  await page.screenshot({path: '/out/filter-open-nl.png'});
}

// -------------------------------------------------------------------------------------------------------------------------
// Result
// -------------------------------------------------------------------------------------------------------------------------
await browser.close();
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
