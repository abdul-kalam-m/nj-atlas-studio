// /?selftest: run every layer's self-test cases in the browser and compare with the counts Python computed.
import { TEXT } from './text.js';
import { cleanState, toPredicate } from './filters.js';
import { el } from './ui.js';
import { formatCount } from './format.js';

// rowsFor(entry, partition) returns a layer's rows, or one municipality's rows for a large layer (D-025).
export async function runSelftest(container, catalog, rowsFor) {
  const body = el('tbody');
  const header = el('tr', {}, [TEXT.selftest.layerColumn, TEXT.selftest.testColumn, TEXT.selftest.expectedColumn,
    TEXT.selftest.gotColumn, TEXT.selftest.resultColumn].map((label) => el('th', { scope: 'col', text: label })));
  const summary = el('p', { class: 'summary', id: 'selftest-summary', text: TEXT.loading });
  container.replaceChildren(el('h2', { text: TEXT.selftest.heading }), el('table', {}, [el('thead', {}, header), body]),
    summary);
  let allPassed = true;
  for (const entry of catalog.layers) {
    const cases = entry.selftest ?? [];
    if (!cases.length) allPassed = false;
    for (const testCase of cases) {
      const rows = await rowsFor(entry, testCase.partition ?? null);
      const got = rows.filter(toPredicate(cleanState(testCase.state, entry.fields))).length;
      const passed = got === testCase.expected;
      allPassed &&= passed;
      body.append(el('tr', {}, [
        el('td', { text: entry.title }), el('td', { text: testCase.label }),
        el('td', { class: 'num', text: formatCount(testCase.expected) }), el('td', { class: 'num', text: formatCount(got) }),
        el('td', { class: passed ? 'pass' : 'fail', text: passed ? TEXT.selftest.pass : TEXT.selftest.fail }),
      ]));
    }
  }
  summary.textContent = allPassed ? TEXT.selftest.summaryPass : TEXT.selftest.summaryFail;
  summary.className = `summary ${allPassed ? 'pass' : 'fail'}`;
  return allPassed;
}
