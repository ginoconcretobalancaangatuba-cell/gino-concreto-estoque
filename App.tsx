
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
  Key
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

// Removed manual Window interface declaration to avoid conflict with pre-existing AIStudio types 
// in the runtime environment. We use casting for accessing window.aistudio.

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
  const [hasApiKey, setHasApiKey] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [modalType, setModalType] = useState<'invoice' | 'adjustment' | 'reset' | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialName>('Brita 0');
  const [inputQuantity, setInputQuantity] = useState('');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_STOCK, JSON.stringify(stock));
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));
  }, [stock, history]);

  // Check for API key presence on load.
  useEffect(() => {
    const checkKey = async () => {
      if (process.env.API_KEY) {
        setHasApiKey(true);
      } else if ((window as any).aistudio) {
        // Accessing environment-injected aistudio helper.
        const selected = await (window as any).aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      } else {
        setHasApiKey(false);
      }
    };
    checkKey();
  }, []);

  const handleConfigKey = async () => {
    if ((window as any).aistudio) {
      await (window as any).aistudio.openSelectKey();
      // Assume success after opening selection to mitigate race conditions.
      setHasApiKey(true);
    } else {
      alert("Para configurar a chave, você deve estar em um ambiente que suporte Google AI Studio.");
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
    if (qty <= 0) {
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

  const processScaleReport = async (file: File) => {
    if (!file) return;
    setIsLoading(true);
    
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const result = reader.result as string;
          const mimeType = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
          const base64 = result.split(',')[1];
          
          const data: ScaleReportExtraction = await parseScaleReport(mimeType, base64);
          const totalWeight = data.brita0 + data.brita1 + data.areiaMedia + data.areiaBrita + data.areiaFina;
          
          if (totalWeight === 0) {
            alert('Não foi possível encontrar pesos de materiais. Verifique se o ticket está legível.');
            setIsLoading(false);
            return;
          }

          setStock(prev => {
            const updated = { ...prev };
            updated['Brita 0'] = Math.max(0, updated['Brita 0'] - data.brita0);
            updated['Brita 1'] = Math.max(0, updated['Brita 1'] - data.brita1);
            const totalAreia = data.areiaMedia + data.areiaFina;
            updated['Areia Média'] = Math.max(0, updated['Areia Média'] - totalAreia);
            updated['Areia de Brita'] = Math.max(0, updated['Areia de Brita'] - data.areiaBrita);
            return updated;
          });

          addTransaction('SCALE_REPORT', undefined, 0, `Balança: Abatimento de ${totalWeight.toLocaleString('pt-BR')} kg.`);
          alert(`Sucesso! Abatidos ${totalWeight.toLocaleString('pt-BR')} kg.`);
        } catch (err: any) {
          // Reset key status if key issues are detected.
          if (err.message?.includes("API key not valid") || err.message?.includes("Requested entity was not found")) {
            alert("A chave de acesso expirou. Por favor, reconfigure o acesso.");
            setHasApiKey(false);
          } else {
            alert("Erro ao ler o PDF. Tente enviar novamente.");
          }
        } finally {
          setIsLoading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      alert('Erro inesperado no upload.');
      setIsLoading(false);
    }
  };

  const confirmReset = () => {
    localStorage.clear();
    setStock({ 'Brita 0': 0, 'Brita 1': 0, 'Areia Média': 0, 'Areia de Brita': 0 });
    setHistory([]);
    setModalType(null);
  };

  const downloadReport = () => {
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(37, 99, 235);
    doc.text('Gino Concreto', 14, 20);
    doc.setFontSize(11);
    doc.text('Relatório Geral de Estoque - Angatuba', 14, 28);
    autoTable(doc, {
      startY: 38,
      head: [['Material', 'Estoque (Kg)', 'Status']],
      body: MATERIALS_LIST.map(m => [m, stock[m].toLocaleString('pt-BR'), stock[m] < STOCK_MIN_THRESHOLD ? 'ESTOQUE BAIXO' : 'OK']),
      headStyles: { fillColor: [37, 99, 235] }
    });
    doc.save(`gino_estoque_${new Date().getTime()}.pdf`);
  };

  const loadsPossible = Math.floor(Math.min(
    stock['Brita 0'] / RECIPE['Brita 0'] || 0,
    stock['Brita 1'] / RECIPE['Brita 1'] || 0,
    stock['Areia Média'] / RECIPE['Areia Média'] || 0,
    stock['Areia de Brita'] / RECIPE['Areia de Brita'] || 0
  )) || 0;
  const m3Possible = loadsPossible * LOAD_VOLUME_M3;

  const getLastInvoice = (material: MaterialName) => history.find(h => h.type === 'INVOICE' && h.material === material);
  const getLastReport = () => history.find(h => h.type === 'SCALE_REPORT');

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col gap-6 max-w-7xl mx-auto">
      
      {/* HEADER */}
      <header className="flex flex-col items-center bg-slate-900/90 p-8 md:p-12 rounded-[40px] border border-slate-700/50 shadow-2xl gap-8 relative overflow-hidden">
        
        {/* Banner de Aviso de Chave */}
        {!hasApiKey && (
          <div className="absolute top-0 left-0 w-full bg-rose-600/90 text-white py-2 px-4 text-center text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 animate-pulse">
            <AlertTriangle size={14} />
            Configuração de Acesso Pendente
            <button onClick={handleConfigKey} className="ml-4 bg-white text-rose-600 px-3 py-1 rounded-full hover:bg-slate-100 transition-colors">
              Configurar Agora
            </button>
          </div>
        )}

        <div className="text-center mt-4">
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter mb-2">
            <span className="text-blue-500 uppercase">Gino</span> <span className="text-white uppercase">Concreto</span>
          </h1>
          <p className="text-slate-500 font-bold uppercase text-[10px] md:text-xs tracking-[0.5em]">Controle de Estoque Angatuba</p>
        </div>

        <div className="flex flex-wrap justify-center gap-4">
          {!hasApiKey && (
            <button onClick={handleConfigKey} className="flex items-center gap-3 bg-amber-600 hover:bg-amber-500 text-white px-8 py-4 rounded-2xl font-black transition-all shadow-xl hover:-translate-y-1 active:scale-95 text-sm uppercase">
              <Key size={20} /> Configurar Acesso
            </button>
          )}

          <button onClick={() => setModalType('invoice')} className="flex items-center gap-3 bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-2xl font-black transition-all shadow-xl hover:-translate-y-1 active:scale-95 text-sm uppercase">
            <PlusCircle size={20} /> Lançar Nota
          </button>
          
          <button onClick={() => setModalType('adjustment')} className="flex items-center gap-3 bg-slate-700 hover:bg-slate-600 text-white px-8 py-4 rounded-2xl font-black transition-all shadow-xl hover:-translate-y-1 active:scale-95 text-sm uppercase">
            <Settings2 size={20} /> Ajuste Manual
          </button>
          
          <button 
            onClick={() => fileInputRef.current?.click()} 
            disabled={isLoading || !hasApiKey}
            className={`flex items-center gap-3 bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-4 rounded-2xl font-black transition-all shadow-xl hover:-translate-y-1 active:scale-95 text-sm uppercase ${isLoading || !hasApiKey ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <FileUp size={20} /> {isLoading ? 'Lendo Balança...' : 'Enviar Balança'}
          </button>
          
          <button onClick={downloadReport} className="flex items-center gap-3 bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-4 rounded-2xl font-black transition-all shadow-xl hover:-translate-y-1 active:scale-95 text-sm uppercase">
            <Download size={20} /> Exportar PDF
          </button>
          
          <button onClick={() => setModalType('reset')} className="flex items-center gap-3 bg-rose-600 hover:bg-rose-500 text-white px-8 py-4 rounded-2xl font-black transition-all shadow-xl hover:-translate-y-1 active:scale-95 text-sm uppercase">
            <Trash2 size={20} /> Limpar Tudo
          </button>
          
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept=".pdf,image/*" 
            onChange={(e) => e.target.files?.[0] && processScaleReport(e.target.files[0])} 
          />
        </div>
      </header>

      {/* GRID DE MATERIAIS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {MATERIALS_LIST.map(material => {
            const isLow = stock[material] < STOCK_MIN_THRESHOLD;
            const lastNote = getLastInvoice(material);
            return (
              <div key={material} className={`relative p-8 rounded-[32px] border-2 transition-all shadow-xl overflow-hidden ${isLow ? 'bg-rose-950/20 border-rose-500/40' : 'bg-slate-800/40 border-slate-700/50'}`}>
                {isLow && (
                  <div className="absolute top-0 right-0 p-4 animate-pulse">
                    <AlertTriangle size={24} className="text-rose-500" />
                  </div>
                )}
                <div className="flex items-center gap-4 mb-6">
                  <Package size={28} className={isLow ? 'text-rose-400' : 'text-blue-400'} />
                  <h3 className="text-slate-400 text-xs font-black uppercase tracking-[0.2em]">{material}</h3>
                </div>
                
                <div className="flex items-baseline gap-3">
                  <span className={`text-6xl font-black tracking-tighter ${isLow ? 'text-rose-400' : 'text-white'}`}>
                    {Math.round(stock[material]).toLocaleString('pt-BR')}
                  </span>
                  <span className="text-slate-500 font-bold text-lg">kg</span>
                </div>
                
                <div className="mt-8 pt-6 border-t border-slate-700/50 text-[10px] text-slate-500 font-black uppercase">
                  {lastNote ? `Último: ${new Date(lastNote.timestamp).toLocaleDateString()} (${lastNote.details})` : 'Sem registros'}
                </div>
              </div>
            );
          })}
        </div>

        {/* CAPACIDADE */}
        <div className="flex flex-col gap-6">
          <div className="bg-gradient-to-br from-blue-600/20 to-indigo-700/20 border border-blue-500/30 p-10 rounded-[32px] shadow-2xl">
            <h2 className="text-xl font-black mb-10 flex items-center gap-3 text-white">
              <TrendingUp className="text-blue-400" size={24} /> CAPACIDADE
            </h2>
            <div className="space-y-10">
              <div>
                <div className="flex justify-between items-end mb-3">
                  <span className="text-slate-200 font-bold text-xs uppercase tracking-widest">Cargas (8m³)</span>
                  <span className="text-7xl font-black text-white leading-none">{loadsPossible}</span>
                </div>
                <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-700">
                  <div className="h-full bg-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.5)] transition-all duration-1000" style={{ width: `${Math.min(100, (loadsPossible / 40) * 100)}%` }} />
                </div>
              </div>
              <div className="bg-slate-950/50 p-6 rounded-2xl border border-blue-500/10 text-5xl font-black text-blue-400">
                {m3Possible.toFixed(0)} <span className="text-xl text-slate-600">m³</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/30 border border-slate-700 p-8 rounded-[32px] flex-grow">
            <h2 className="text-[10px] font-black mb-6 flex items-center gap-3 text-slate-400 uppercase tracking-[0.3em]">
              <FileText size={18} className="text-emerald-400" /> Histórico Balança
            </h2>
            {getLastReport() ? (
              <div className="space-y-4">
                <p className="text-[10px] text-slate-500 font-black">{new Date(getLastReport()!.timestamp).toLocaleString('pt-BR')}</p>
                <div className="text-[11px] text-slate-400 italic bg-slate-900/40 p-5 rounded-2xl border border-slate-800/50 leading-relaxed">
                  {getLastReport()?.details}
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-slate-600 text-center py-10 uppercase font-black">Nenhuma leitura realizada</p>
            )}
          </div>
        </div>
      </div>

      {/* MODAL */}
      {modalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
          <div className="bg-slate-900 w-full max-w-lg rounded-[40px] border border-slate-700 shadow-2xl overflow-hidden">
            <div className="p-8 border-b border-slate-800 flex justify-between items-center">
              <h2 className="text-xl font-black text-white uppercase tracking-tight">
                {modalType === 'invoice' ? 'Lançar Nota' : modalType === 'adjustment' ? 'Ajuste Manual' : 'Resetar'}
              </h2>
              <button onClick={() => setModalType(null)} className="text-slate-500 hover:text-white transition-colors"><X size={24} /></button>
            </div>
            
            <div className="p-8 space-y-6">
              {modalType === 'reset' ? (
                <div className="text-center space-y-8">
                  <p className="text-slate-300 font-bold">Deseja apagar todo o estoque e histórico?<br/><span className="text-rose-500 uppercase text-xs">Esta ação não tem volta.</span></p>
                  <div className="flex gap-4">
                    <button onClick={() => setModalType(null)} className="flex-1 bg-slate-800 text-white font-black py-5 rounded-2xl uppercase text-xs">Cancelar</button>
                    <button onClick={confirmReset} className="flex-1 bg-rose-600 text-white font-black py-5 rounded-2xl uppercase text-xs">Confirmar</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {MATERIALS_LIST.map(m => (
                      <button key={m} onClick={() => setSelectedMaterial(m)} className={`p-4 rounded-2xl font-black text-[10px] uppercase border-2 transition-all ${selectedMaterial === m ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>{m}</button>
                    ))}
                  </div>
                  <input 
                    type="text" 
                    placeholder="Quantidade em Kg"
                    value={inputQuantity}
                    onChange={(e) => setInputQuantity(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 p-6 rounded-2xl text-3xl font-black text-white focus:outline-none focus:border-blue-500"
                    autoFocus
                  />
                  <button onClick={handleModalSubmit} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-6 rounded-2xl uppercase text-xs tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-blue-500/20"><CheckCircle2 size={20} /> Confirmar</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <footer className="mt-auto py-12 text-[10px] text-slate-600 font-black uppercase tracking-[0.3em] flex flex-col md:flex-row justify-between items-center gap-4 border-t border-slate-800/50">
        <p>© 2025 GINO CONCRETO - UNIDADE ANGATUBA</p>
        <p className="bg-slate-950 px-6 py-2 rounded-full border border-slate-800">Desenvolvido por Jose Neto</p>
      </footer>
    </div>
  );
};

export default App;
