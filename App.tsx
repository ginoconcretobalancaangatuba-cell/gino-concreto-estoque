
import React, { useState, useEffect, useRef } from 'react';
import { 
  PlusCircle, 
  Trash2, 
  FileUp, 
  FileText, 
  TrendingUp, 
  AlertTriangle,
  Download,
  Package,
  Settings2,
  X,
  CheckCircle2,
  Loader2,
  Lock
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  StockState, 
  Transaction, 
  MaterialName, 
  TransactionType 
} from './types.ts';
import { 
  STOCK_MIN_THRESHOLD, 
  RECIPE, 
  LOAD_VOLUME_M3, 
  MATERIALS_LIST 
} from './constants.ts';
import { parseScaleReport, ScaleReportExtraction } from './services/geminiService.ts';

const App: React.FC = () => {
  const STORAGE_KEY_STOCK = 'gino_stock_v5';
  const STORAGE_KEY_HISTORY = 'gino_history_v5';

  const [stock, setStock] = useState<StockState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_STOCK);
      return saved ? JSON.parse(saved) : {
        'Brita 0': 0,
        'Brita 1': 0,
        'Areia Média': 0,
        'Areia de Brita': 0,
      };
    } catch (e) {
      return { 'Brita 0': 0, 'Brita 1': 0, 'Areia Média': 0, 'Areia de Brita': 0 };
    }
  });

  const [history, setHistory] = useState<Transaction[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_HISTORY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [modalType, setModalType] = useState<'invoice' | 'adjustment' | 'reset' | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialName>('Brita 0');
  const [inputQuantity, setInputQuantity] = useState('');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_STOCK, JSON.stringify(stock));
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));
  }, [stock, history]);

  const generateId = () => Date.now().toString(36) + Math.random().toString(36).substring(2);

  const addTransaction = (type: TransactionType, material: MaterialName | undefined, quantity: number, details?: string) => {
    const newTx: Transaction = {
      id: generateId(),
      timestamp: Date.now(),
      type,
      material,
      quantity,
      details,
    };
    setHistory(prev => [newTx, ...prev].slice(0, 50));
  };

  const parseNumber = (val: string): number => {
    const cleaned = val.replace(/\./g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  };

  const handleModalSubmit = () => {
    const qty = parseNumber(inputQuantity);
    if (qty <= 0 && modalType !== 'reset') {
      alert('Insira uma quantidade válida.');
      return;
    }

    if (modalType === 'invoice') {
      setStock(prev => ({ ...prev, [selectedMaterial]: prev[selectedMaterial] + qty }));
      addTransaction('INVOICE', selectedMaterial, qty, `Entrada: +${qty.toLocaleString('pt-BR')} kg`);
    } else if (modalType === 'adjustment') {
      setStock(prev => ({ ...prev, [selectedMaterial]: qty }));
      addTransaction('INVOICE', selectedMaterial, qty, `Ajuste: ${qty.toLocaleString('pt-BR')} kg`);
    }

    setModalType(null);
    setInputQuantity('');
  };

  const processScaleReport = async (file: File) => {
    if (!file) return;
    setIsLoading(true);
    
    try {
      const reader = new FileReader();
      const fileReadPromise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);
      
      const result = await fileReadPromise;
      const mimeType = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
      const base64Data = result.split(',')[1];
      
      const data: ScaleReportExtraction = await parseScaleReport(mimeType, base64Data);
      
      const update = {
        'Brita 0': data.brita0,
        'Brita 1': data.brita1,
        'Areia Média': data.areiaMedia,
        'Areia de Brita': data.areiaBrita
      };

      setStock(prev => {
        const next = { ...prev };
        (Object.keys(update) as MaterialName[]).forEach(m => {
          next[m] = Math.max(0, next[m] - update[m]);
        });
        return next;
      });

      const totalRemoved = Object.values(update).reduce((a, b) => a + b, 0);
      if (totalRemoved === 0) {
        alert("Aviso: Nenhum material foi detectado no ticket. Verifique a qualidade da imagem.");
      } else {
        addTransaction('SCALE_REPORT', undefined, 0, `Saída Balança: ${totalRemoved.toLocaleString('pt-BR')} kg total.`);
        alert("Estoque atualizado com sucesso!");
      }
    } catch (e: any) {
      console.error(e);
      // Se houver erro de chave, agora sugerimos a ação apenas no momento do erro
      if (e.message?.includes("API key not valid") || e.message?.includes("CHAVE") || e.message?.includes("Requested entity was not found")) {
        const confirmConfig = confirm("Erro de Acesso: A chave de API não foi detectada ou é inválida. Deseja selecionar uma chave agora?");
        if (confirmConfig && (window as any).aistudio) {
          await (window as any).aistudio.openSelectKey();
        }
      } else {
        alert("Falha ao processar arquivo: " + e.message);
      }
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Relatório de Estoque - GINO', 14, 22);
    const stockData = MATERIALS_LIST.map(m => [m, `${stock[m].toLocaleString('pt-BR')} kg`]);
    autoTable(doc, {
      startY: 30,
      head: [['Material', 'Saldo Atual']],
      body: stockData,
    });
    doc.save('relatorio-gino.pdf');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-10">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg"><Package className="w-6 h-6 text-white" /></div>
            <h1 className="text-xl font-bold tracking-tight">GINO <span className="text-slate-400 font-normal">| Concreto</span></h1>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={handleDownloadPDF} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-all font-medium text-sm">
              <Download className="w-4 h-4" /> Exportar Relatório
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 pt-8 space-y-8">
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {MATERIALS_LIST.map((material) => {
            const currentStock = stock[material];
            const isLow = currentStock < STOCK_MIN_THRESHOLD;
            return (
              <div key={material} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                <div className={`absolute top-0 left-0 w-full h-1.5 ${isLow ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                <div className="flex justify-between items-start mb-4">
                  <span className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">{material}</span>
                  {isLow ? <AlertTriangle className="w-5 h-5 text-rose-500 animate-pulse" /> : <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black">{currentStock.toLocaleString('pt-BR')}</span>
                  <span className="text-slate-400 font-bold text-sm">kg</span>
                </div>
                <div className="mt-6 bg-slate-50 h-2 rounded-full overflow-hidden">
                  <div className={`h-full transition-all duration-1000 ${isLow ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, (currentStock / (STOCK_MIN_THRESHOLD * 2)) * 100)}%` }} />
                </div>
              </div>
            );
          })}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
              <h2 className="text-xl font-black mb-8 flex items-center gap-3"><TrendingUp className="w-6 h-6 text-blue-600" /> Movimentação de Carga</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <button onClick={() => setModalType('invoice')} className="flex flex-col items-center gap-4 p-8 border-2 border-dashed border-slate-200 rounded-3xl hover:border-blue-500 hover:bg-blue-50 transition-all group">
                  <div className="p-4 bg-blue-100 rounded-2xl group-hover:scale-110 transition-transform"><PlusCircle className="w-8 h-8 text-blue-600" /></div>
                  <div className="text-center">
                    <span className="block font-black text-slate-800 uppercase text-xs tracking-wider">Entrada de Material</span>
                    <span className="text-xs text-slate-500 mt-1 block">Lançamento via Nota Fiscal</span>
                  </div>
                </button>
                <div className="relative">
                  <input type="file" ref={fileInputRef} onChange={(e) => e.target.files?.[0] && processScaleReport(e.target.files[0])} className="hidden" accept="image/*,application/pdf" />
                  <button disabled={isLoading} onClick={() => fileInputRef.current?.click()} className={`w-full flex flex-col items-center gap-4 p-8 border-2 border-dashed border-slate-200 rounded-3xl transition-all group ${isLoading ? 'opacity-50 cursor-wait' : 'hover:border-emerald-500 hover:bg-emerald-50'}`}>
                    <div className="p-4 bg-emerald-100 rounded-2xl group-hover:scale-110 transition-transform">
                      {isLoading ? <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" /> : <FileUp className="w-8 h-8 text-emerald-600" />}
                    </div>
                    <div className="text-center">
                      <span className="block font-black text-slate-800 uppercase text-xs tracking-wider">{isLoading ? 'Processando...' : 'Ticket de Balança'}</span>
                      <span className="text-xs text-slate-500 mt-1 block">Leitura Automática por IA</span>
                    </div>
                  </button>
                </div>
              </div>
              <div className="mt-8 pt-8 border-t border-slate-100 flex justify-center">
                <button onClick={() => setModalType('adjustment')} className="text-xs font-bold text-slate-400 hover:text-blue-600 transition-colors uppercase tracking-widest flex items-center gap-2">
                  <Settings2 className="w-4 h-4" /> Ajuste Manual de Inventário
                </button>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2"><FileText className="w-4 h-4" /> Log de Operações</h2>
                <button onClick={() => setHistory([])} className="text-[10px] font-bold text-rose-500 hover:bg-rose-50 px-3 py-1 rounded-full transition-colors">LIMPAR LOG</button>
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                <table className="w-full text-left">
                  <tbody className="divide-y divide-slate-100">
                    {history.length === 0 ? (
                      <tr><td className="px-6 py-12 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">Nenhuma atividade registrada</td></tr>
                    ) : (
                      history.map((tx) => (
                        <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 text-[10px] font-mono text-slate-400 w-32">{new Date(tx.timestamp).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</td>
                          <td className="px-6 py-4"><span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${tx.type === 'INVOICE' ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'}`}>{tx.type === 'INVOICE' ? 'ENTRADA' : 'BALANÇA'}</span></td>
                          <td className="px-6 py-4 text-xs font-bold text-slate-700">{tx.details}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <aside className="space-y-6">
            <div className="bg-slate-900 text-white rounded-3xl p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute -top-10 -right-10 opacity-5"><TrendingUp className="w-48 h-48" /></div>
              <h3 className="text-sm font-black uppercase tracking-widest mb-6 text-blue-400">Receita de Referência</h3>
              <p className="text-slate-400 text-xs mb-8 leading-relaxed">Consumo padrão por carga de <span className="text-white font-bold">{LOAD_VOLUME_M3}m³</span> utilizada para estimativa de autonomia.</p>
              <div className="space-y-5">
                {Object.entries(RECIPE).map(([mat, qty]) => (
                  <div key={mat} className="flex justify-between items-center border-b border-slate-800 pb-3">
                    <span className="text-slate-400 text-xs font-medium">{mat}</span>
                    <span className="font-mono font-black text-blue-200">{qty.toLocaleString('pt-BR')} <span className="text-[10px] opacity-50">KG</span></span>
                  </div>
                ))}
              </div>
              <div className="mt-10 p-5 bg-white/5 rounded-2xl border border-white/10 flex items-start gap-3">
                <Lock className="w-4 h-4 text-amber-500 mt-0.5" />
                <div>
                  <span className="text-[10px] font-black uppercase tracking-tighter text-amber-500">Parâmetros Travados</span>
                  <p className="text-[9px] text-slate-500 mt-1 leading-tight">A edição das receitas de traço é restrita ao administrador de planta.</p>
                </div>
              </div>
            </div>
          </aside>
        </section>
      </main>

      {modalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[40px] w-full max-w-md shadow-2xl overflow-hidden animate-in slide-in-from-bottom-8 duration-300">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-xl font-black text-slate-800">{modalType === 'invoice' ? 'Lançar Nota' : 'Ajustar Estoque'}</h3>
              <button onClick={() => setModalType(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            <div className="p-10 space-y-8">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Selecione o Material</label>
                <div className="grid grid-cols-2 gap-3">
                  {MATERIALS_LIST.map(m => (
                    <button key={m} onClick={() => setSelectedMaterial(m)} className={`px-4 py-3 text-[10px] font-black rounded-2xl border-2 transition-all uppercase tracking-tighter ${selectedMaterial === m ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-sm' : 'border-slate-100 text-slate-400 hover:border-slate-200'}`}>{m}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Quantidade (Kg)</label>
                <div className="relative">
                  <input type="text" value={inputQuantity} onChange={(e) => setInputQuantity(e.target.value)} placeholder="0.000" className="w-full px-6 py-5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-2xl font-black focus:border-blue-600 focus:outline-none transition-all placeholder:text-slate-200" autoFocus />
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-300 font-black text-sm uppercase">KG</div>
                </div>
              </div>
              <button onClick={handleModalSubmit} className="w-full py-6 bg-blue-600 text-white rounded-3xl text-sm font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 active:scale-[0.98]">Confirmar Operação</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
