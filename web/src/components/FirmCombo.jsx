import React from 'react';
import { Building2 } from 'lucide-react';
import MasterCombo from './MasterCombo';
import { getFirms, createFirm } from '../services/api';

const FirmCombo = ({ value, onChange, error, label = "Firm Name", ...props }) => {
    return (
        <MasterCombo
            label={label}
            value={value}
            onChange={onChange}
            fetchOptions={getFirms}
            createOption={createFirm}
            icon={Building2}
            placeholder="Select or add firm..."
            error={error}
            dataKey="name"
            {...props}
        />
    );
};

export default FirmCombo;
