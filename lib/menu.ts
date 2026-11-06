// Menu por setores, conforme o protótipo. "href" ausente = módulo previsto (em breve / fases seguintes).

export interface Item { id: string; t: string; href: string; mod: string; soon?: boolean }
export interface Grupo { grp: string; t: string; sub: Item[] }
export interface Setor { id: string; t: string; icon: string; items: (Item | Grupo)[] }

const prev = (id: string, t: string, mod: string): Item => ({ id, t, mod, href: '/modulo/' + id, soon: true });

export const SETORES: Setor[] = [
  {
    id: 'rh', t: 'Recursos Humanos', icon: 'rh', items: [
      prev('painel', 'Painel de RH', 'painel'),
      { grp: 'func', t: 'Funcionários', sub: [
        { id: 'colab', t: 'Cadastro de funcionários', href: '/rh/funcionarios', mod: 'colab' },
        { id: 'admissao', t: 'Nova admissão', href: '/rh/admissao', mod: 'admissao' },
        prev('movim', 'Desligamentos', 'movim'),
      ] },
      { id: 'ponto', t: 'Folha de ponto', href: '/rh/ponto', mod: 'ponto' },
      { id: 'rateio', t: 'Rateio da folha', href: '/rh/rateio', mod: 'rateio' },
      prev('va', 'Vale-alimentação', 'va'),
      prev('ferias', 'Férias', 'ferias'),
      prev('rotinas', 'Rotinas do mês', 'rotinas'),
    ],
  },
  {
    id: 'sst', t: 'Saúde e Segurança (SESMT)', icon: 'sst', items: [
      prev('sst_painel', 'Painel do SESMT', 'sst'), prev('sst_mob', 'Mobilização de novos funcionários', 'sst'),
      prev('sst_aso', 'ASO e exames', 'sst'), prev('sst_trein', 'Treinamentos NR', 'sst'), prev('sst_epi', 'EPI – entregas', 'sst'),
      prev('sst_dds', 'DDS', 'sst'), prev('sst_insp', 'Inspeções e plano de ação', 'sst'), prev('sst_pt', 'Permissões de trabalho', 'sst'),
      prev('sst_ocor', 'Ocorrências e CAT', 'sst'), prev('sst_prog', 'Programas, laudos e CIPA', 'sst'),
    ],
  },
  { id: 'log', t: 'Logística', icon: 'log', items: [prev('log_frota', 'Frota e veículos', 'logistica'), prev('log_comb', 'Abastecimentos', 'logistica'), prev('log_man', 'Manutenção e avarias', 'logistica'), prev('log_multas', 'Multas', 'logistica'), prev('log_acid', 'Acidentes com veículos', 'logistica')] },
  { id: 'eng', t: 'Engenharia e Operação', icon: 'eng', items: [prev('eng_avanco', 'Avanço físico', 'engenharia'), prev('eng_prod', 'Produtividade', 'engenharia'), prev('eng_qual', 'Qualidade', 'engenharia')] },
  { id: 'fin', t: 'Financeiro', icon: 'fin', items: [prev('fin_pagar', 'Contas a pagar', 'financeiro'), prev('fin_receber', 'Contas a receber', 'financeiro'), prev('fin_fluxo', 'Fluxo de caixa', 'financeiro'), prev('fin_custos', 'Custos por obra', 'financeiro')] },
  { id: 'sup', t: 'Suprimentos', icon: 'sup', items: [prev('sup_sol', 'Solicitações de compra', 'suprimentos'), prev('sup_cot', 'Cotações', 'suprimentos'), prev('sup_ped', 'Pedidos de compra', 'suprimentos'), prev('sup_est', 'Almoxarifado e estoque', 'suprimentos')] },
  { id: 'emp', t: 'Empresa', icon: 'emp', items: [prev('emp_docs', 'Documentos e certidões', 'docsemp'), prev('emp_com', 'Comunicados', 'comunicados')] },
  { id: 'ind', t: 'Indicadores', icon: 'ind', items: [prev('indicadores', 'Catálogo de indicadores', 'indicadores')] },
  {
    id: 'adm', t: 'Administração', icon: 'adm', items: [
      prev('usuarios', 'Usuários', 'usuarios'), prev('perfis', 'Perfis e permissões', 'usuarios'),
      { id: 'modelos', t: 'Modelos de documentos', href: '/adm/modelos', mod: 'modelos' },
      prev('auditoria', 'Auditoria', 'auditoria'),
    ],
  },
];

export const isGrupo = (i: Item | Grupo): i is Grupo => 'grp' in i;
export const itensDoSetor = (s: Setor) => s.items.flatMap((i) => (isGrupo(i) ? i.sub : [i]));
export const TODOS_ITENS = SETORES.flatMap(itensDoSetor);

/** Rota atual -> [setor, (grupo), item] para o breadcrumb e o item ativo */
export function localizar(path: string) {
  for (const s of SETORES) for (const i of s.items) {
    if (isGrupo(i)) { const x = i.sub.find((y) => path === y.href || path.startsWith(y.href + '/')); if (x) return { setor: s, grupo: i, item: x }; }
    else if (path === i.href || path.startsWith(i.href + '/')) return { setor: s, grupo: null, item: i };
  }
  return null;
}

export const ICON: Record<string, string> = {
  sst: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
  emp: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  fin: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  sup: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7L12 12l8.7-5M12 22V12"/>',
  home: '<path d="M3 10l9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  rh: '<path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 20v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  log: '<path d="M1 3h15v13H1zM16 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  eng: '<path d="M2 20h20M4 20V9l8-5 8 5v11M9 20v-6h6v6"/>',
  ind: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  adm: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
};
