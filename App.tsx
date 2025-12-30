
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
  CheckCircle2
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  StockState, 
  Transaction, 
  MaterialName, 
  TransactionType 
} from './types';
import { 
  STOCK_MIN_THRESHOLD, 
  RECIPE, 
  LOAD_VOLUME_M3, 
  MATERIALS_LIST 
} from './constants';
import { parseScaleReport, ScaleReportExtraction } from './services/geminiService';

const App: React.FC = () => {
  const STORAGE_KEY_STOCK = 'gino_stock_v4';
  const STORAGE_KEY_HISTORY = 'gino_history_v4';

  // --- Estados do Sistema ---
  const [stock, setStock] = useState<StockState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_STOCK);
    return saved ? JSON.parse(saved) : {
      'Brita 0': 0,
      'Brita 1': 0,
      'Areia Média': 0,
      'Areia de Brita': 0,
    };
  });

  const [history, setHistory] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_HISTORY);
    return saved ? JSON.parse(saved) : [];
  });

  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Estados do Modal ---
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
    return parseFloat(cleaned);
  };

  // --- Lógica de Ações ---

  const handleModalSubmit = () => {
    const qty = parseNumber(inputQuantity);
    if (isNaN(qty) || qty < 0) {
      alert('Por favor, insira uma quantidade válida.');
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
    setIsLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const result = reader.result as string;
        const mimeType = file.type || (result.startsWith('data:application/pdf') ? 'application/pdf' : 'image/jpeg');
        const base64 = result.split(',')[1];
        
        const data: ScaleReportExtraction = await parseScaleReport(mimeType, base64);

        setStock(prev => {
          const updated = { ...prev };
          updated['Brita 0'] = Math.max(0, updated['Brita 0'] - data.brita0);
          updated['Brita 1'] = Math.max(0, updated['Brita 1'] - data.brita1);
          const totalAreia = data.areiaMedia + data.areiaFina;
          updated['Areia Média'] = Math.max(0, updated['Areia Média'] - totalAreia);
          updated['Areia de Brita'] = Math.max(0, updated['Areia de Brita'] - data.areiaBrita);
          return updated;
        });

        addTransaction('SCALE_REPORT', undefined, 0, `Balança: Saída de B0:${data.brita0}kg, B1:${data.brita1}kg, Areias:${data.areiaMedia + data.areiaFina}kg, AB:${data.areiaBrita}kg`);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      alert('Erro ao ler PDF.');
    } finally {
      setIsLoading(false);
    }
  };

  const confirmReset = () => {
    localStorage.removeItem(STORAGE_KEY_STOCK);
    localStorage.removeItem(STORAGE_KEY_HISTORY);
    setStock({ 'Brita 0': 0, 'Brita 1': 0, 'Areia Média': 0, 'Areia de Brita': 0 });
    setHistory([]);
    setModalType(null);
  };

  const downloadReport = () => {
    const doc = new jsPDF();
    
    // Configurações do Cabeçalho
    doc.setFontSize(24);
    doc.setTextColor(37, 99, 235); // Azul
    doc.text('Gino Concreto', 14, 20);
    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text('Usina de Angatuba - Relatório Profissional de Estoque', 14, 28);
    doc.setDrawColor(200);
    doc.line(14, 32, 196, 32);
    
    // Tabela de Materiais com Destaque em Vermelho
    autoTable(doc, {
      startY: 38,
      head: [['Material', 'Estoque Atual (Kg)', 'Status']],
      body: MATERIALS_LIST.map(m => [
        m, 
        stock[m].toLocaleString('pt-BR'),
        stock[m] < STOCK_MIN_THRESHOLD ? 'ESTOQUE BAIXO' : 'OK'
      ]),
      headStyles: { fillColor: [37, 99, 235], fontStyle: 'bold' },
      didParseCell: (data) => {
        if (data.section === 'body') {
          // Acessa o nome do material na primeira coluna da linha atual
          const materialName = data.row.raw[0] as MaterialName;
          // Se o estoque estiver abaixo do mínimo, aplica a cor vermelha
          if (stock[materialName] < STOCK_MIN_THRESHOLD) {
            data.cell.styles.textColor = [220, 38, 38]; // Vermelho (Tailwind red-600)
            if (data.column.index === 2) { // Coluna de Status
              data.cell.styles.fontStyle = 'bold';
            }
          }
        }
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY || 100;
    
    // Informações de Produção
    doc.setFontSize(16);
    doc.setTextColor(0);
    doc.text('Estimativa de Carga e Volume', 14, finalY + 15);
    doc.setFontSize(11);
    doc.setTextColor(60);
    doc.text(`Cargas completas de 8m³ possíveis: ${loadsPossible}`, 14, finalY + 25);
    doc.text(`Volume total disponível: ${m3Possible.toFixed(2)} m³`, 14, finalY + 32);

    // Últimos Eventos
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text('Últimas Movimentações', 14, finalY + 45);
    autoTable(doc, {
      startY: finalY + 50,
      head: [['Data', 'Operação', 'Detalhes']],
      body: history.slice(0, 5).map(h => [
        new Date(h.timestamp).toLocaleString('pt-BR'),
        h.type === 'INVOICE' ? 'Entrada/Ajuste' : 'Saída Balança',
        h.details || '-'
      ]),
      headStyles: { fillColor: [71, 85, 105] }
    });

    // Rodapé
    doc.setFontSize(9);
    doc.setTextColor(150);
    doc.text(`Relatório gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 285);
    doc.text('Desenvolvido por Jose Neto', 150, 285);
    
    doc.save(`gino_angatuba_estoque_${new Date().getTime()}.pdf`);
  };

  // --- Cálculos ---
  const loadsPossible = Math.floor(
    Math.min(
      stock['Brita 0'] / RECIPE['Brita 0'] || 0,
      stock['Brita 1'] / RECIPE['Brita 1'] || 0,
      stock['Areia Média'] / RECIPE['Areia Média'] || 0,
      stock['Areia de Brita'] / RECIPE['Areia de Brita'] || 0
    )
  ) || 0;
  const m3Possible = loadsPossible * LOAD_VOLUME_M3;

  const getLastInvoice = (material: MaterialName) => history.find(h => h.type === 'INVOICE' && h.material === material);
  const getLastReport = () => history.find(h => h.type === 'SCALE_REPORT');

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col gap-6 max-w-7xl mx-auto">
      
      {/* HEADER PROFISSIONAL COM BOTÕES */}
      <header className="flex flex-col items-center bg-slate-900/95 p-10 rounded-3xl border border-slate-700 shadow-2xl gap-8">
        <div className="text-center">
          <h1 className="text-6xl font-black tracking-tighter mb-2">
            <span className="text-blue-500 uppercase">Gino</span> <span className="text-white uppercase">Concreto</span>
          </h1>
          <p className="text-slate-500 font-bold uppercase text-[12px] tracking-[0.5em]">Controle de Estoque Angatuba</p>
        </div>

        <div className="flex flex-wrap justify-center gap-4">
          <button 
            onClick={() => setModalType('invoice')}
            className="group flex items-center gap-3 bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-2xl font-black transition-all shadow-xl hover:-translate-y-1 active:scale-95 text-sm uppercase"
          >
            <PlusCircle size={22} className="group-hover:rotate-90 transition-transform" /> Lançar Nota
          </button>
          
          <button 
            onClick={() => setModalType('adjustment')}
            className="flex items-center gap-3 bg-slate-700 hover:bg-slate-600 text-white px-8 py-4 rounded-2xl font-black transition-all shadow-xl hover:-translate-y-1 active:scale-95 text-sm uppercase"
          >
            <Settings2 size={22} /> Ajuste Manual
          </button>
          
          <button 
            onClick={() => fileInputRef.current?.click()} 
            disabled={isLoading}
            className={`flex items-center gap-3 bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-4 rounded-2xl font-black transition-all shadow-xl hover:-translate-y-1 active:scale-95 text-sm uppercase ${isLoading ? 'opacity-50' : ''}`}
          >
            <FileUp size={22} /> {isLoading ? 'Lendo PDF...' : 'Enviar PDF'}
          </button>
          
          <button 
            onClick={downloadReport} 
            className="flex items-center gap-3 bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-4 rounded-2xl font-black transition-all shadow-xl hover:-translate-y-1 active:scale-95 text-sm uppercase"
          >
            <Download size={22} /> PDF
          </button>
          
          <button 
            onClick={() => setModalType('reset')}
            className="flex items-center gap-3 bg-rose-600 hover:bg-rose-500 text-white px-8 py-4 rounded-2xl font-black transition-all shadow-xl hover:-translate-y-1 active:scale-95 text-sm uppercase"
          >
            <Trash2 size={22} /> Zerar Estoque
          </button>
          
          <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,image/*" onChange={(e) => e.target.files?.[0] && processScaleReport(e.target.files[0])} />
        </div>
      </header>

      {/* GRID DE MATERIAIS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {MATERIALS_LIST.map(material => {
            const isLow = stock[material] < STOCK_MIN_THRESHOLD;
            const lastNote = getLastInvoice(material);
            return (
              <div key={material} className={`relative p-8 rounded-3xl border-2 transition-all shadow-xl overflow-hidden ${isLow ? 'bg-rose-950/20 border-rose-500/40' : 'bg-slate-800/40 border-slate-700/50'}`}>
                {isLow && (
                  <div className="absolute top-0 right-0 p-4">
                    <div className="flex items-center gap-2 text-rose-500 bg-rose-500/10 px-4 py-2 rounded-full border border-rose-500/20 animate-pulse">
                      <AlertTriangle size={14} />
                      <span className="text-[10px] font-black uppercase tracking-widest">Estoque Crítico</span>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-4 mb-6">
                  <div className={`p-4 rounded-2xl ${isLow ? 'bg-rose-500/20' : 'bg-blue-500/10'}`}>
                    <Package size={32} className={isLow ? 'text-rose-400' : 'text-blue-400'} />
                  </div>
                  <h3 className="text-slate-400 text-sm font-black uppercase tracking-widest">{material}</h3>
                </div>
                
                <div className="flex items-baseline gap-3">
                  <span className={`text-6xl font-black tracking-tighter ${isLow ? 'text-rose-400' : 'text-white'}`}>
                    {Math.round(stock[material]).toLocaleString('pt-BR')}
                  </span>
                  <span className="text-slate-500 font-bold text-lg uppercase">kg</span>
                </div>
                
                <div className="mt-8 pt-6 border-t border-slate-700/50">
                  <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-3">Último Lançamento:</p>
                  {lastNote ? (
                    <div className="bg-slate-900/60 p-4 rounded-2xl flex justify-between items-center border border-slate-700/50">
                      <span className="text-xs text-slate-400 font-bold">{new Date(lastNote.timestamp).toLocaleDateString()}</span>
                      <span className="text-emerald-400 font-black text-xs uppercase">{lastNote.details}</span>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-600 italic font-medium">Nenhum registro encontrado</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* PAINEL DE PERFORMANCE */}
        <div className="flex flex-col gap-6">
          <div className="bg-gradient-to-br from-blue-600/30 to-indigo-700/30 border border-blue-500/40 p-10 rounded-3xl shadow-2xl relative overflow-hidden group">
            <div className="absolute -right-8 -bottom-8 opacity-5 text-white group-hover:scale-110 transition-transform">
              <TrendingUp size={200} />
            </div>
            <h2 className="text-2xl font-black mb-10 flex items-center gap-3 text-white">
              <TrendingUp className="text-blue-300" size={28} /> PRODUÇÃO
            </h2>
            <div className="space-y-10">
              <div>
                <div className="flex justify-between items-end mb-3">
                  <span className="text-slate-200 font-bold text-sm uppercase tracking-widest">Cargas de 8m³</span>
                  <span className="text-7xl font-black text-white">{loadsPossible}</span>
                </div>
                <div className="w-full bg-slate-900/80 h-4 rounded-full overflow-hidden border border-slate-700">
                  <div 
                    className="h-full bg-blue-500 shadow-[0_0_25px_rgba(59,130,246,0.8)] transition-all duration-1000 ease-out" 
                    style={{ width: `${Math.min(100, (loadsPossible / 40) * 100)}%` }} 
                  />
                </div>
              </div>
              <div className="bg-slate-900/70 p-8 rounded-3xl border border-blue-500/20 backdrop-blur-md">
                <span className="text-slate-400 font-black text-[12px] uppercase block mb-2 tracking-[0.2em]">Volume Total em m³</span>
                <span className="text-5xl font-black text-blue-400 tracking-tighter">{m3Possible.toFixed(0)} <span className="text-xl font-bold text-slate-600">m³</span></span>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/40 border border-slate-700 p-8 rounded-3xl flex-grow shadow-xl">
            <h2 className="text-xs font-black mb-6 flex items-center gap-3 text-slate-400 uppercase tracking-[0.3em]">
              <FileText className="text-emerald-400" size={18} /> Histórico Balança
            </h2>
            {getLastReport() ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center bg-slate-900/80 p-4 rounded-2xl border border-slate-700/50">
                  <span className="text-[10px] text-slate-500 font-black">REGISTRO</span>
                  <span className="text-[11px] text-slate-200 font-black uppercase">{new Date(getLastReport()!.timestamp).toLocaleString('pt-BR')}</span>
                </div>
                <div className="text-[12px] text-slate-400 leading-relaxed bg-slate-900/40 p-5 rounded-2xl border border-slate-800 italic font-medium">
                  {getLastReport()?.details}
                </div>
              </div>
            ) : (
              <div className="h-40 flex flex-col items-center justify-center border-2 border-dashed border-slate-700 rounded-3xl opacity-40">
                <FileText size={32} className="mb-2 text-slate-500" />
                <p className="text-[10px] text-slate-500 font-black uppercase text-center">Nenhum PDF processado</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer className="mt-12 py-12 flex flex-col md:flex-row justify-between items-center gap-6 text-[11px] text-slate-600 font-black uppercase tracking-[0.3em] border-t border-slate-800">
        <p>© 2025 GINO CONCRETO - GESTÃO DE ATIVOS</p>
        <div className="flex items-center gap-6 bg-slate-900/60 px-10 py-4 rounded-full border border-slate-800 shadow-2xl">
          <span className="opacity-50">SISTEMA DESENVOLVIDO POR</span>
          <span className="text-blue-500 font-black hover:text-blue-400 transition-all cursor-pointer">JOSE NETO</span>
        </div>
      </footer>

      {/* --- MODAL DE ENTRADA --- */}
      {modalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 w-full max-w-lg rounded-3xl border border-slate-700 shadow-[0_0_100px_rgba(30,58,138,0.5)] overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 border-b border-slate-800 flex justify-between items-center">
              <h2 className="text-xl font-black text-white uppercase tracking-tight">
                {modalType === 'invoice' ? 'Lançar Nota Fiscal' : modalType === 'adjustment' ? 'Ajuste de Estoque' : 'Zerar Sistema'}
              </h2>
              <button onClick={() => setModalType(null)} className="p-2 text-slate-400 hover:text-white transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              {modalType === 'reset' ? (
                <div className="text-center space-y-6">
                  <div className="p-6 bg-rose-500/10 rounded-2xl border border-rose-500/20 inline-block">
                    <Trash2 size={48} className="text-rose-500 mx-auto" />
                  </div>
                  <p className="text-slate-300 font-bold leading-relaxed">
                    Você tem certeza que deseja ZERAR todo o estoque e apagar o histórico? Esta ação não pode ser desfeita.
                  </p>
                  <div className="flex gap-4">
                    <button onClick={() => setModalType(null)} className="flex-1 bg-slate-800 text-white font-black py-4 rounded-2xl uppercase text-sm">Cancelar</button>
                    <button onClick={confirmReset} className="flex-1 bg-rose-600 text-white font-black py-4 rounded-2xl uppercase text-sm">Sim, Zerar Tudo</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Selecione o Material</label>
                    <div className="grid grid-cols-2 gap-2">
                      {MATERIALS_LIST.map(m => (
                        <button 
                          key={m} 
                          onClick={() => setSelectedMaterial(m)}
                          className={`p-4 rounded-xl font-bold text-xs uppercase border-2 transition-all ${selectedMaterial === m ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'}`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Quantidade em KG</label>
                    <input 
                      type="text" 
                      placeholder="Ex: 50.000"
                      value={inputQuantity}
                      onChange={(e) => setInputQuantity(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 p-5 rounded-2xl text-2xl font-black text-white focus:outline-none focus:border-blue-500 transition-colors"
                      autoFocus
                    />
                    <p className="text-[10px] text-slate-600 font-medium italic">Use pontos ou vírgulas se necessário.</p>
                  </div>

                  <button 
                    onClick={handleModalSubmit}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-5 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl uppercase text-sm"
                  >
                    <CheckCircle2 size={20} /> Confirmar Lançamento
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
