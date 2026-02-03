import React, { useState } from 'react';
import { api } from '../services/api';

const ExcelImport = () => {
    const [file, setFile] = useState(null);
    const [message, setMessage] = useState('');

    const handleFileChange = (e) => {
        setFile(e.target.files[0]);
    };

    const handleUpload = async () => {
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await api.post('/containers/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });
            setMessage(`Success: ${response.data.message}`);
        } catch (error) {
            console.error('Error uploading file:', error);
            setMessage('Error uploading file');
        }
    };

    return (
        <div className="glass-card p-8 rounded-2xl border border-slate-200 max-w-2xl mx-auto mt-10">
            <h2 className="text-2xl font-bold mb-6 text-slate-800">Import Excel Data</h2>
            
            <div className="mb-6 p-8 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 flex flex-col items-center justify-center text-center hover:border-blue-400 transition-colors">
                <input 
                    type="file" 
                    onChange={handleFileChange} 
                    accept=".xlsx, .xls"
                    className="block w-full text-sm text-slate-500
                        file:mr-4 file:py-2 file:px-4
                        file:rounded-full file:border-0
                        file:text-sm file:font-semibold
                        file:bg-blue-600 file:text-white
                        hover:file:bg-blue-700
                        cursor-pointer"
                />
                <p className="mt-2 text-sm text-slate-500">Supported formats: .xlsx, .xls</p>
            </div>

            <button 
                onClick={handleUpload} 
                className="w-full bg-blue-600 text-white px-4 py-3 rounded-xl hover:bg-blue-700 font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!file}
            >
                Upload and Process
            </button>
            
            {message && (
                <div className={`mt-6 p-4 rounded-lg border ${message.includes('Success') ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                    {message}
                </div>
            )}
        </div>
    );
};

export default ExcelImport;
