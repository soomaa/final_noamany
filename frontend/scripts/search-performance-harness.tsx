// Local regression fixture; this page is never part of the production build.
import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LocaleProvider } from '../src/store/locale';
import { DataTable } from '../src/components/common/data-table';
import { ReceptionMemberSearchBox } from '../src/components/club/reception-member-search-box';
import { MemberSearchCombobox } from '../src/components/club/member-search-combobox';
import { useReceptionMemberSearch, receptionSearchOptions } from '../src/hooks/use-reception-member-search';
import { useQueryClient } from '@tanstack/react-query';
import { Input } from '../src/components/ui/input';
import '../src/styles/index.css';
import arClub from '../src/locales/club.ar.json';
import enClub from '../src/locales/club.en.json';
import { registerLocaleDictionary } from '../src/ports/locale-dictionary-registry';
registerLocaleDictionary('ar', { club: arClub });
registerLocaleDictionary('en', { club: enClub });

const qa = { commits: [] as string[], submits: [] as string[], tableRenders: 0,
  baselineRenders: 0, receptionRenders: 0, acknowledgementDelay: 0,
  external: (_value: string) => {}, unmountTable: () => {}, mountTable: () => {} };
(window as any).searchQA = qa;
const rows = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, name: `عضو تجريبي ${i + 1}` }));
const columns = [{ accessorKey: 'name', header: 'العضو' }];

function TableFixture() {
  const [query, setQuery] = useState('');
  qa.tableRenders++;
  qa.external = setQuery;
  return <DataTable columns={columns} data={rows} total={25} page={1} pageSize={25}
    search={query} onSearchChange={value => {
      qa.commits.push(value);
      if (qa.acknowledgementDelay) setTimeout(() => setQuery(value), qa.acknowledgementDelay);
      else setQuery(value);
    }} onPageChange={() => {}} enableExport={false} />;
}
function BaselineFixture() {
  const [query, setQuery] = useState('');
  qa.baselineRenders++;
  return <><Input aria-label="baseline" value={query} onChange={event => setQuery(event.target.value)} />
    {rows.map(row => <p key={row.id}>{row.name}</p>)}</>;
}
function ReceptionFixture() {
  const [query, setQuery] = useState('');
  qa.receptionRenders++;
  return <ReceptionMemberSearchBox value={query} tabletMode={false} searching={false}
    onQueryChange={value => { qa.commits.push(value); setQuery(value); }}
    onSubmit={value => qa.submits.push(value)} onOpenCamera={() => {}} />;
}
function LiveReceptionFixture() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const qc = useQueryClient();
  const search = useReceptionMemberSearch(query, 2, 'female');
  return <>
    <ReceptionMemberSearchBox value={query} tabletMode={false} searching={search.isFetching}
      onQueryChange={setQuery} onOpenCamera={() => {}}
      onSubmit={async value => {
        const result = await qc.fetchQuery(receptionSearchOptions(value, 2, 'female'));
        setSelected(result.hits[0]?.name ?? '');
      }} />
    <output data-selected>{selected}</output>
    {search.data?.hits.map(hit => <button key={hit.id} data-hit onClick={() => setSelected(hit.name)}>
      {hit.name}<span data-package>{hit.activeSubscriptionType}</span>
    </button>)}
  </>;
}
function Fixture() {
  const [show, setShow] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const renders = useRef(0);
  renders.current++;
  qa.unmountTable = () => setShow(false);
  qa.mountTable = () => setShow(true);
  return <main className="mx-auto max-w-5xl space-y-6 p-5">
    <section id="table">{show && <TableFixture />}</section>
    <section id="reception"><ReceptionFixture /></section>
    <section id="combobox"><MemberSearchCombobox selectedMember={selected} onSelect={setSelected} onClear={() => setSelected(null)} branchId={2} /></section>
    <section id="live-reception"><LiveReceptionFixture /></section>
    <section id="baseline"><BaselineFixture /></section>
  </main>;
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <BrowserRouter><LocaleProvider><Fixture /></LocaleProvider></BrowserRouter>
  </QueryClientProvider>,
);
