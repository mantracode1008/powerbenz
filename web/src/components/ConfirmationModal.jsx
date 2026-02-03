const ConfirmationModal = ({ 
    isOpen, 
    onClose, 
    onConfirm, 
    title, 
    message, 
    confirmText = "Delete", 
    confirmColor = "bg-red-600",
    showCancel = true
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm overflow-y-auto h-full w-full flex justify-center items-center z-50">
            <div className="bg-white p-6 rounded-2xl shadow-xl w-96 transform transition-all scale-100 border border-slate-200">
                <h3 className="text-xl font-bold text-slate-800 mb-4">{title}</h3>
                <p className="text-slate-600 mb-6">{message}</p>
                <div className="flex justify-end gap-3">
                    {showCancel && (
                        <button 
                            onClick={onClose}
                            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors font-medium"
                        >
                            Cancel
                        </button>
                    )}
                    <button 
                        onClick={onConfirm}
                        className={`px-4 py-2 text-white rounded-lg hover:opacity-90 transition-colors font-medium shadow-sm ${confirmColor}`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationModal;
