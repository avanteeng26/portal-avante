// Espelho de ponto imprimível no mesmo layout do protótipo (formato da planilha Excel da Avante).
import { DOW, esc, fD, hhmm, hoje, hx, hxs, dk } from './format';
import { calcDia, diasPer, linhaVazia, ocNome, periodo, type Calendario, type LinhaPonto } from './ponto';

export interface DadosEspelho { nome: string; funcao: string; matricula: string; cpf: string; admissao: Date }

export function espelhoExcel(cal: Calendario, e: DadosEspelho, k: string, pontos: Record<string, LinhaPonto>, logo: string) {
  const p = periodo(k);
  const T0 = hoje();
  const T = { carga: 0, atraso: 0, falta: 0, he50: 0, he100: 0 };
  const rows = diasPer(k).map((d) => {
    const r0 = pontos[dk(d)];
    const r = r0 && !linhaVazia(r0) ? r0 : null;
    const o = calcDia(cal, r, d);
    const cinza = d.getDay() === 0 || d.getDay() === 6 || cal.isFer(d);
    const fut = d >= T0 || d < e.admissao;
    if (!fut && o.carga) T.carga += o.carga;
    T.atraso += o.atraso; T.falta += o.falta; T.he50 += o.he50; T.he100 += o.he100;
    let marc: string;
    if (r && r.oc !== 'TRABALHADO') marc = `<td colspan="4" class="c">${esc(ocNome(r.oc).toUpperCase())}</td>`;
    else if (!r && cal.isFer(d) && !fut) marc = '<td colspan="4" class="c">FERIADO</td>';
    else marc = (['e', 'sa', 'r', 's'] as const).map((f) => `<td class="c">${r && r[f] ? hhmm(r[f]) : ''}</td>`).join('');
    return `<tr class="${cinza ? 'g' : ''}"><td class="l">${DOW[d.getDay()]}</td><td class="c">${d.getDate()}</td>${marc}<td class="c">${fut ? '' : hx(o.trab)}</td><td class="c">${fut ? '' : hx(o.carga)}</td><td class="c">${o.atraso ? hx(o.atraso) : ''}</td><td class="c">${o.falta ? hx(o.falta) : ''}</td><td class="c">${o.he50 ? hx(o.he50) : ''}</td><td class="c">${o.he100 ? hx(o.he100) : ''}</td></tr>`;
  }).join('');
  const normal = Math.max(0, T.carga - T.atraso - T.falta);
  return `<div class="esx"><table class="tt"><tr><td class="lg"><img src="${logo}" alt=""></td><td class="ti">ESPELHO DE PONTO</td></tr></table>
 <table class="hd"><tr><td class="k">NOME:</td><td>${esc(e.nome.toUpperCase())}</td><td class="k r">ADMISSÃO:</td><td>${fD(e.admissao).replace(/^0/, '').replace('/0', '/')}</td></tr><tr><td class="k">CARGO:</td><td>${esc(e.funcao.toUpperCase())}</td><td class="k r">MATRÍCULA:</td><td>${esc(e.matricula)}</td></tr><tr><td class="k">CPF:</td><td>${esc(e.cpf)}</td><td class="k r">PERÍODO:</td><td>${fD(p.ini)} a ${fD(p.fim)}</td></tr></table>
 <table class="gr"><colgroup><col style="width:10%"><col style="width:5%"><col style="width:8%"><col style="width:8%"><col style="width:8%"><col style="width:8%"><col style="width:11%"><col style="width:8%"><col style="width:8%"><col style="width:8%"><col style="width:9%"><col style="width:9%"></colgroup>
 <tr class="h"><td colspan="2">Data</td><td colspan="4">Marcações</td><td>Trabalhada</td><td>Normal</td><td>Atraso</td><td>Falta</td><td>50%</td><td>100 %</td></tr>${rows}</table>
 <table class="tot"><tr><td class="a">HORA NORMAL</td><td class="b">${hxs(normal)}</td><td class="sp"></td><td class="a c">ATRASO</td><td class="b">${hxs(T.atraso)}</td></tr><tr><td class="a">HORA EXTRA 50%</td><td class="b">${hxs(T.he50)}</td><td class="sp"></td><td class="a c">FALTA</td><td class="b">${hxs(T.falta)}</td></tr><tr><td class="a">HORA EXTRA 100%</td><td class="b">${hxs(T.he100)}</td><td class="sp"></td><td></td><td></td></tr></table>
 <table class="as"><tr><td><div></div>Assinatura do Funcionário</td><td class="sp"></td><td><div></div>Assinatura da Chefia</td></tr></table></div>`;
}
