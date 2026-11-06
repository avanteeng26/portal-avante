// Modelos de contrato e ficha de registro (textos-base do protótipo) e preenchimento automático.
import { addD, dExt, esc, fD, hoje, N, pdk } from './format';
import type { Empresa, ModeloDocumento } from './types';

export const PH: [string, string][] = [
  ['empresa_razao', 'Razão social'], ['empresa_cnpj', 'CNPJ'], ['empresa_endereco', 'Endereço da empresa'], ['empresa_cidade', 'Cidade/UF da empresa'],
  ['empresa_representante', 'Representante legal'], ['empresa_rep_cargo', 'Cargo do representante'],
  ['nome', 'Nome do empregado'], ['cpf', 'CPF'], ['rg', 'RG'], ['pis', 'PIS/NIS'], ['nascimento', 'Data de nascimento'], ['estado_civil', 'Estado civil'],
  ['endereco', 'Endereço do empregado'], ['telefone', 'Telefone'], ['matricula', 'Matrícula'],
  ['cargo', 'Cargo/função'], ['obra', 'Obra inicial'], ['salario', 'Salário (número)'], ['salario_extenso', 'Salário por extenso'], ['adicional', 'Adicionais'], ['jornada', 'Jornada'],
  ['data_admissao', 'Data de admissão'], ['data_admissao_extenso', 'Admissão por extenso'], ['fim_exp1', 'Fim do 1º período (45 dias)'], ['fim_exp2', 'Fim da prorrogação (90 dias)'],
  ['previsao_fim', 'Previsão de término (obra certa)'], ['tipo_contrato', 'Tipo de contrato'], ['data_hoje_extenso', 'Data de hoje por extenso'],
];

export const TXT_EXP = `# CONTRATO DE TRABALHO A TÍTULO DE EXPERIÊNCIA

Pelo presente instrumento particular, de um lado **{{empresa_razao}}**, inscrita no CNPJ sob o nº {{empresa_cnpj}}, com sede em {{empresa_endereco}}, neste ato representada por {{empresa_representante}}, {{empresa_rep_cargo}}, doravante denominada **EMPREGADORA**, e de outro lado **{{nome}}**, portador(a) do CPF nº {{cpf}}, RG nº {{rg}}, PIS/NIS nº {{pis}}, nascido(a) em {{nascimento}}, {{estado_civil}}, residente em {{endereco}}, doravante denominado(a) **EMPREGADO(A)**, ajustam o presente contrato de trabalho a título de experiência, nos termos dos arts. 443, 445 e 451 da CLT, mediante as cláusulas seguintes:

## Cláusula 1ª – Função
O(A) EMPREGADO(A) é admitido(a) para exercer a função de **{{cargo}}**, obrigando-se a executar as atividades inerentes à função e outras compatíveis com sua condição pessoal, conforme orientação da EMPREGADORA.

## Cláusula 2ª – Local de trabalho
O trabalho será prestado nas obras e canteiros da EMPREGADORA, inicialmente na obra **{{obra}}**. Considerando a natureza da atividade de construção, o(a) EMPREGADO(A) concorda com a prestação de serviços em outras obras, inclusive em outras localidades, quando necessário, nos termos do art. 469 da CLT.

## Cláusula 3ª – Remuneração
O(A) EMPREGADO(A) receberá salário mensal de **R$ {{salario}}** ({{salario_extenso}}), {{adicional}}, pago até o 5º (quinto) dia útil do mês subsequente ao vencido.

## Cláusula 4ª – Jornada de trabalho
A jornada de trabalho será de {{jornada}}. As horas extraordinárias e a compensação de jornada observarão a legislação, o acordo de compensação/banco de horas e a convenção coletiva aplicável.

## Cláusula 5ª – Prazo de experiência
Este contrato vigorará por 45 (quarenta e cinco) dias, de {{data_admissao}} a {{fim_exp1}}, podendo ser prorrogado uma única vez por igual período, até {{fim_exp2}}, sem que a soma ultrapasse 90 (noventa) dias. Continuando o(a) EMPREGADO(A) a trabalhar após o término do prazo, o contrato passará a vigorar por prazo indeterminado.

## Cláusula 6ª – Descontos
O(A) EMPREGADO(A) autoriza os descontos previstos em lei e em convenção coletiva e, em caso de dano causado por dolo, ou por culpa mediante acordo, o desconto do respectivo valor, nos termos do art. 462, § 1º, da CLT.

## Cláusula 7ª – Saúde e segurança do trabalho
O(A) EMPREGADO(A) obriga-se a cumprir as normas de segurança e saúde do trabalho, a participar dos treinamentos exigidos e a usar corretamente os equipamentos de proteção individual fornecidos. A recusa injustificada constitui ato faltoso, nos termos do art. 158 da CLT.

## Cláusula 8ª – Regulamento interno e dados pessoais
O(A) EMPREGADO(A) declara conhecer o regulamento interno da EMPREGADORA e está ciente de que seus dados pessoais serão tratados para a execução deste contrato e o cumprimento de obrigações legais, conforme a Lei nº 13.709/2018 (LGPD).

E, por estarem de acordo, as partes assinam o presente em 2 (duas) vias de igual teor, na presença de 2 (duas) testemunhas.

{{empresa_cidade}}, {{data_hoje_extenso}}.

[[assinaturas]]

## Termo de prorrogação
Por mútuo acordo entre as partes, o presente contrato de experiência fica prorrogado até {{fim_exp2}}.

{{empresa_cidade}}, ____ de ______________ de ______.

[[assinaturas-partes]]`;

const cutProrr = (t: string) => t.split('\n## Termo de prorrogação')[0];
export const TXT_IND = cutProrr(TXT_EXP)
  .replace('# CONTRATO DE TRABALHO A TÍTULO DE EXPERIÊNCIA', '# CONTRATO INDIVIDUAL DE TRABALHO POR PRAZO INDETERMINADO')
  .replace('o presente contrato de trabalho a título de experiência, nos termos dos arts. 443, 445 e 451 da CLT', 'o presente contrato individual de trabalho por prazo indeterminado, nos termos do art. 443 da CLT')
  .replace(/## Cláusula 5ª – Prazo de experiência\n.*\n/, '## Cláusula 5ª – Início e prazo\nO presente contrato tem início em {{data_admissao}} e vigorará por prazo indeterminado.\n');
export const TXT_OBRA = cutProrr(TXT_EXP)
  .replace('# CONTRATO DE TRABALHO A TÍTULO DE EXPERIÊNCIA', '# CONTRATO DE TRABALHO POR PRAZO DETERMINADO (OBRA CERTA)')
  .replace('o presente contrato de trabalho a título de experiência, nos termos dos arts. 443, 445 e 451 da CLT', 'o presente contrato de trabalho por prazo determinado, nos termos do art. 443, §§ 1º e 2º, da CLT e da Lei nº 2.959/1956')
  .replace(/## Cláusula 5ª – Prazo de experiência\n.*\n/, '## Cláusula 5ª – Prazo (obra certa)\nO presente contrato é celebrado para a execução de serviços na obra **{{obra}}**, iniciando em {{data_admissao}} e extinguindo-se com a conclusão dos serviços para os quais o(a) EMPREGADO(A) foi contratado(a), com previsão de término em {{previsao_fim}}, respeitado o limite de 2 (dois) anos previsto no art. 445 da CLT.\n');
export const TXT_FICHA = `# FICHA DE REGISTRO DE EMPREGADO

**Empregadora:** {{empresa_razao}} · CNPJ {{empresa_cnpj}}
**Endereço:** {{empresa_endereco}}

## Identificação
**Matrícula:** {{matricula}}
**Nome:** {{nome}}
**CPF:** {{cpf}} · **RG:** {{rg}} · **PIS/NIS:** {{pis}}
**Data de nascimento:** {{nascimento}} · **Estado civil:** {{estado_civil}}
**Endereço:** {{endereco}}
**Telefone:** {{telefone}}

## Contrato
**Função:** {{cargo}}
**Data de admissão:** {{data_admissao}}
**Tipo de contrato:** {{tipo_contrato}}
**Local de trabalho inicial:** {{obra}}
**Salário:** R$ {{salario}} ({{salario_extenso}})
**Adicionais:** {{adicional}}
**Jornada:** {{jornada}}

Declaro que as informações acima são verdadeiras.

{{empresa_cidade}}, {{data_hoje_extenso}}.

[[assinaturas-partes]]`;

/** Modelos padrão: usados enquanto não houver modelos cadastrados em public.modelos_documento */
export const MODELOS_PADRAO: ModeloDocumento[] = [
  { id: 'padrao-ctexp', nome: 'Contrato de experiência (45 + 45 dias)', tipo: 'contrato', usar_para: 'Experiência 45 + 45 dias', texto: TXT_EXP, versao: 1, atualizado_por: null, atualizado_em: '' },
  { id: 'padrao-ctobra', nome: 'Contrato por prazo determinado (obra certa)', tipo: 'contrato', usar_para: 'Prazo determinado (obra)', texto: TXT_OBRA, versao: 1, atualizado_por: null, atualizado_em: '' },
  { id: 'padrao-ctind', nome: 'Contrato por prazo indeterminado', tipo: 'contrato', usar_para: 'Prazo indeterminado', texto: TXT_IND, versao: 1, atualizado_por: null, atualizado_em: '' },
  { id: 'padrao-ficha', nome: 'Ficha de registro do empregado', tipo: 'ficha', usar_para: null, texto: TXT_FICHA, versao: 1, atualizado_por: null, atualizado_em: '' },
];
export const ehPadrao = (m: ModeloDocumento) => m.id.startsWith('padrao-');

// ---------- valores por extenso ----------
const U_ = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const T_ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const H_ = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
function e999(n: number) {
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100), r = n % 100, o: string[] = [];
  if (c) o.push(H_[c]);
  if (r) { if (r < 20) o.push(U_[r]); else { const t = Math.floor(r / 10), u = r % 10; o.push(T_[t] + (u ? ' e ' + U_[u] : '')); } }
  return o.join(' e ');
}
function extInt(n: number) {
  if (n === 0) return 'zero';
  const mi = Math.floor(n / 1e6), mil = Math.floor((n % 1e6) / 1000), r = n % 1000;
  const g: [string, number][] = [];
  if (mi) g.push([mi === 1 ? 'um milhão' : e999(mi) + ' milhões', mi * 1e6]);
  if (mil) g.push([mil === 1 ? 'mil' : e999(mil) + ' mil', mil * 1000]);
  if (r) g.push([e999(r), r]);
  return g.map((x, i) => (i === 0 ? x[0] : ((x[1] <= 100 || x[1] % 100 === 0) && x[1] < 1000 ? ' e ' : ' ') + x[0])).join('');
}
export function extenso(v: number) {
  v = Math.round(v * 100) / 100;
  const i = Math.floor(v), c = Math.round((v - i) * 100);
  let s = '';
  if (i) s = extInt(i) + (i >= 1e6 && i % 1e6 === 0 ? ' de' : '') + (i === 1 ? ' real' : ' reais');
  if (c) s += (i ? ' e ' : '') + extInt(c) + (c === 1 ? ' centavo' : ' centavos');
  return s || 'zero reais';
}

// ---------- contexto de preenchimento ----------
export interface DadosDoc {
  nome?: string | null; cpf?: string | null; rg?: string | null; pis?: string | null; nasc?: string | null; ec?: string | null; end?: string | null; tel?: string | null; mat?: string | null;
  cargo: string; obra: string; salario?: number | null; adicional?: boolean; adm?: Date | null; prev?: string | null; tipo?: string | null;
}
export function contexto(E: Empresa, jornada: string, o: DadosDoc): Record<string, string> {
  const adm = o.adm;
  const vd = (x: string | null | undefined) => x || '';
  return {
    empresa_razao: E.razao_social, empresa_cnpj: E.cnpj, empresa_endereco: E.endereco, empresa_cidade: E.cidade, empresa_representante: E.representante, empresa_rep_cargo: E.representante_cargo,
    jornada, nome: vd(o.nome), cpf: vd(o.cpf), rg: vd(o.rg), pis: vd(o.pis), nascimento: o.nasc ? fD(o.nasc) : '', estado_civil: vd(o.ec), endereco: vd(o.end), telefone: vd(o.tel), matricula: vd(o.mat),
    cargo: o.cargo, obra: o.obra, salario: o.salario ? N(o.salario, 2) : '', salario_extenso: o.salario ? extenso(o.salario) : '',
    adicional: o.adicional ? 'acrescido de adicional de periculosidade de 30% (trinta por cento) sobre o salário-base' : 'sem adicionais',
    data_admissao: adm ? fD(adm) : '', data_admissao_extenso: adm ? dExt(adm) : '', fim_exp1: adm ? fD(addD(adm, 44)) : '', fim_exp2: adm ? fD(addD(adm, 89)) : '',
    previsao_fim: o.prev ? fD(pdk(o.prev)) : '', tipo_contrato: o.tipo || '', data_hoje_extenso: dExt(hoje()),
  };
}

export function renderModelo(texto: string, ctx: Record<string, string>) {
  const falt = new Set<string>();
  const sub = (s: string) =>
    esc(s).replace(/\{\{(\w+)\}\}/g, (_m, k: string) => {
      const v = ctx[k];
      if (v === undefined || v === '') { falt.add(k); return `<span class="miss">[${esc((PH.find((p) => p[0] === k) || [k, k])[1])}]</span>`; }
      return esc(v);
    }).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const sig = (l: string[]) => `<table class="sig"><tr>${l.map((x) => `<td><div class="sl"></div>${x}</td>`).join('')}</tr></table>`;
  const html = texto.replace(/\r/g, '').split(/\n\s*\n/).map((b) => {
    b = b.trim();
    if (!b) return '';
    if (b === '[[assinaturas]]') return sig(['<b>' + sub('{{empresa_razao}}') + '</b><br>EMPREGADORA', '<b>' + sub('{{nome}}') + '</b><br>EMPREGADO(A)']) + sig(['Testemunha 1<br>Nome:<br>CPF:', 'Testemunha 2<br>Nome:<br>CPF:']);
    if (b === '[[assinaturas-partes]]') return sig(['<b>' + sub('{{empresa_razao}}') + '</b><br>EMPREGADORA', '<b>' + sub('{{nome}}') + '</b><br>EMPREGADO(A)']);
    return b.split('\n').map((l) => (l.startsWith('# ') ? `<h1>${sub(l.slice(2))}</h1>` : l.startsWith('## ') ? `<h2>${sub(l.slice(3))}</h2>` : `<p>${sub(l)}</p>`)).join('');
  }).join('');
  return { html, falt: [...falt] };
}

export const nomeCampo = (k: string) => (PH.find((p) => p[0] === k) || [k, k])[1];
