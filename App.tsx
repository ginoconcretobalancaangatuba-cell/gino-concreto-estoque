
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
  Key,
  ShieldAlert,
  ExternalLink,
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
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [modalType, setModalType] = useState<'invoice' | 'adjustment' | 'reset' | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialName>('Brita 0');
  const [inputQuantity, setInputQuantity] = useState('');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_STOCK, JSON.stringify(stock));
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));
  }, [stock, history]);

  // Fix: Added proper implementation for checkKeyStatus
  const checkKeyStatus = async () => {
    if (process.env.API_KEY && process.env.API_KEY !== 'undefined' && process.env.API_KEY !== '') {
      setHasApiKey(true);
      return;
    }

    if ((window as any).aistudio) {
      try {
        const has = await (window as any).aistudio.hasSelectedApiKey();
        setHasApiKey(has);
      } catch (e) {
        setHasApiKey(false);
      }
    } else {
      setHasApiKey(false);
    }
  };

  useEffect(() => {
    checkKeyStatus();
  }, []);

  // Fix: Handle API key selection according to guidelines
  const handleConfigKey = async () => {
    if ((window as any).aistudio) {
      try {
        await (window as any).aistudio.openSelectKey();
        // Assume success to proceed to app UI to avoid race condition
        setHasApiKey(true);
      } catch (e) {
        alert("Erro ao abrir seletor de chave.");
      }
    } else {
      alert("AI Studio não detectado. A chave deve ser fornecida via ambiente.");
    }
  };

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
      alert('Por favor, insira uma quantidade maior que zero.');
      return;
    }

    if (modalType === 'invoice') {
      setStock(prev => ({ ...prev, [selectedMaterial]: prev[selectedMaterial] + qty }));
      addTransaction('INVOICE', selectedMaterial, qty, `Nota Fiscal: +${qty.toLocaleString('pt-BR')} kg`);
    } else if (modalType === 'adjustment') {
      setStock(prev => ({ ...prev, [selectedMaterial]: qty }));
      addTransaction('INVOICE', selectedMaterial, qty, `Ajuste Manual: Definido para ${qty.toLocaleString('pt-BR')} kg`);
    }

    setModalType(null);
    setInputQuantity('');
  };

  // Fix: Completed processScaleReport function and corrected 'base6' typo to 'base64'
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

      const detailStr = Object.entries(update)
        .filter(([_, v]) => v > 0)
        .map(([k, v]) => `${k}: ${v}kg`)
        .join(', ');

      addTransaction('SCALE_REPORT', undefined, 0, `Saída Balança: ${detailStr || 'Nenhum material detectado'}`);
      alert("Ticket processado com sucesso! O estoque foi atualizado.");
    } catch (e: any) {
      alert(`Erro ao processar ticket: ${e.message}`);
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Relatório de Estoque e Movimentação - GINO', 14, 22);
    
    doc.setFontSize(11);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 30);

    const stockData = MATERIALS_LIST.map(m => [m, `${stock[m].toLocaleString('pt-BR')} kg`]);
    autoTable(doc, {
      startY: 40,
      head: [['Material', 'Estoque Atual']],
      body: stockData,
      theme: 'grid',
    });

    const historyData = history.map(tx => [
      new Date(tx.timestamp).toLocaleString('pt-BR'),
      tx.type === 'INVOICE' ? 'Entrada/Ajuste' : 'Saída Balança',
      tx.details || '-'
    ]);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 15,
      head: [['Data/Hora', 'Tipo', 'Detalhes']],
      body: historyData,
      theme: 'striped',
    });

    doc.save('relatorio-gino-estoque.pdf');
  };

  // Fix: Component JSX implementation to resolve the 'void' return error
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-10">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Package className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">GINO <span className="text-slate-400 font-normal">| Concreto</span></h1>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={handleConfigKey}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
            >
              <Settings2 className="w-4 h-4" />
              CONFIGURAR ACESSO
            </button>
            <button 
              onClick={handleDownloadPDF}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-all shadow-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Exportar PDF
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        {/* API Key Banner */}
        {!hasApiKey && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-start gap-4">
            <div className="p-2 bg-amber-100 rounded-full text-amber-600">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-amber-900">Configuração de IA Pendente</h3>
              <p className="text-amber-800 text-sm mt-1">
                Para processar tickets de balança automaticamente, você precisa selecionar uma Chave de API de um projeto pago no Google Cloud Console.
              </p>
              <div className="mt-3 flex items-center gap-4">
                <button 
                  onClick={handleConfigKey}
                  className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors flex items-center gap-2"
                >
                  <Key className="w-4 h-4" />
                  Configurar Chave
                </button>
                <a 
                  href="https://ai.google.dev/gemini-api/docs/billing" 
                  target="_blank" 
                  rel="noreferrer"
                  className="text-amber-700 text-sm font-medium flex items-center gap-1 hover:underline"
                >
                  Documentação de Faturamento <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Dashboard Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {MATERIALS_LIST.map((material) => {
            const currentStock = stock[material];
            const isLow = currentStock < STOCK_MIN_THRESHOLD;
            return (
              <div key={material} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group">
                <div className={`absolute top-0 left-0 w-full h-1 ${isLow ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                <div className="flex justify-between items-start mb-4">
                  <span className="text-slate-500 font-medium text-sm uppercase tracking-wider">{material}</span>
                  {isLow ? (
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  )}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold">{currentStock.toLocaleString('pt-BR')}</span>
                  <span className="text-slate-400 font-medium">kg</span>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-500 ${isLow ? 'bg-amber-500' : 'bg-emerald-500'}`} 
                      style={{ width: `${Math.min(100, (currentStock / (STOCK_MIN_THRESHOLD * 2)) * 100)}%` }}
                    />
                  </div>
                </div>
                {isLow && <p className="text-xs text-amber-600 mt-2 font-medium">Estoque abaixo do recomendado</p>}
              </div>
            );
          })}
        </section>

        {/* Quick Actions */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                Gestão de Estoque
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button 
                  onClick={() => setModalType('invoice')}
                  className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-slate-200 rounded-2xl hover:border-blue-500 hover:bg-blue-50 transition-all group"
                >
                  <div className="p-3 bg-blue-100 rounded-xl group-hover:bg-blue-200 transition-colors">
                    <PlusCircle className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="text-center">
                    <span className="block font-bold text-slate-800">Entrada de Material</span>
                    <span className="text-sm text-slate-500">Adicionar via Nota Fiscal</span>
                  </div>
                </button>

                <div className="relative group">
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={(e) => e.target.files?.[0] && processScaleReport(e.target.files[0])}
                    className="hidden"
                    accept="image/*,application/pdf"
                  />
                  <button 
                    disabled={isLoading}
                    onClick={() => fileInputRef.current?.click()}
                    className={`w-full flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-slate-200 rounded-2xl transition-all group ${isLoading ? 'opacity-50 cursor-wait' : 'hover:border-emerald-500 hover:bg-emerald-50'}`}
                  >
                    <div className="p-3 bg-emerald-100 rounded-xl group-hover:bg-emerald-200 transition-colors">
                      {isLoading ? <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" /> : <FileUp className="w-6 h-6 text-emerald-600" />}
                    </div>
                    <div className="text-center">
                      <span className="block font-bold text-slate-800">{isLoading ? 'Processando...' : 'Lançar Ticket Balança'}</span>
                      <span className="text-sm text-slate-500">Extração automática via IA</span>
                    </div>
                  </button>
                </div>
              </div>
              
              <div className="mt-6 flex justify-center">
                <button 
                  onClick={() => setModalType('adjustment')}
                  className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1 font-medium underline underline-offset-4"
                >
                  Realizar ajuste manual de inventário
                </button>
              </div>
            </div>

            {/* History Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <FileText className="w-5 h-5 text-slate-400" />
                  Histórico Recente
                </h2>
                <button 
                  onClick={() => setHistory([])}
                  className="text-xs text-red-500 font-medium hover:underline"
                >
                  Limpar Histórico
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                      <th className="px-6 py-4 font-semibold">Data/Hora</th>
                      <th className="px-6 py-4 font-semibold">Operação</th>
                      <th className="px-6 py-4 font-semibold">Detalhes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {history.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-6 py-10 text-center text-slate-400 text-sm">
                          Nenhuma movimentação registrada.
                        </td>
                      </tr>
                    ) : (
                      history.map((tx) => (
                        <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {new Date(tx.timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter ${tx.type === 'INVOICE' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {tx.type === 'INVOICE' ? 'Entrada' : 'Balança'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-slate-800">
                            {tx.details}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Sidebar: Rules/Recipe */}
          <div className="space-y-6">
            <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl relative overflow-hidden">
              <div className="absolute top-[-20px] right-[-20px] opacity-10">
                <TrendingUp className="w-32 h-32" />
              </div>
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-400" />
                Receita Padrão
              </h3>
              <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                Consumo estimado por carga de <span className="text-white font-bold">{LOAD_VOLUME_M3}m³</span> de concreto.
              </p>
              <div className="space-y-4">
                {Object.entries(RECIPE).map(([mat, qty]) => (
                  <div key={mat} className="flex justify-between items-center border-b border-slate-800 pb-3">
                    <span className="text-slate-300 text-sm">{mat}</span>
                    <span className="font-mono font-bold">{qty.toLocaleString('pt-BR')} kg</span>
                  </div>
                ))}
              </div>
              <div className="mt-8 p-4 bg-white/5 rounded-xl border border-white/10">
                <div className="flex items-center gap-3 text-amber-400">
                  <Lock className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-widest">Configurações Travadas</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-2">
                  A edição de receitas e parâmetros de sistema requer nível de administrador sênior.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Modal Overlay */}
      {modalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in slide-in-from-bottom-8">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-xl font-bold text-slate-800">
                {modalType === 'invoice' ? 'Lançar Nota Fiscal' : 'Ajuste de Estoque'}
              </h3>
              <button onClick={() => setModalType(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">Material</label>
                <div className="grid grid-cols-2 gap-2">
                  {MATERIALS_LIST.map(m => (
                    <button
                      key={m}
                      onClick={() => setSelectedMaterial(m)}
                      className={`px-3 py-2 text-xs font-bold rounded-xl border-2 transition-all ${selectedMaterial === m ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-sm' : 'border-slate-100 text-slate-500 hover:border-slate-200'}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">Quantidade (Kg)</label>
                <div className="relative">
                  <input 
                    type="text" 
                    value={inputQuantity}
                    onChange={(e) => setInputQuantity(e.target.value)}
                    placeholder="Ex: 15.000"
                    className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-xl font-bold focus:border-blue-600 focus:outline-none transition-all placeholder:text-slate-300"
                    autoFocus
                  />
                  <div className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">KG</div>
                </div>
                <p className="text-xs text-slate-400 mt-2">Dica: Use ponto para milhares se preferir, ou apenas os números.</p>
              </div>

              <button 
                onClick={handleModalSubmit}
                className="w-full py-4 bg-blue-600 text-white rounded-2xl text-lg font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 active:scale-[0.98]"
              >
                Confirmar Lançamento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
