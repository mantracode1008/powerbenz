import React from 'react';
import { Recycle } from 'lucide-react';
import MasterCombo from './MasterCombo';
import { getScrapTypes, createScrapType } from '../services/api';

const ScrapTypeCombo = ({ value, onChange, error, label = "Scrap Type", ...props }) => {
    return (
        <MasterCombo
            label={label}
            value={value}
            onChange={onChange}
            fetchOptions={getScrapTypes}
            createOption={createScrapType}
            icon={Recycle}
            placeholder="Select or add scrap type..."
            error={error}
            dataKey="name"
            {...props}
        />
    );
};

export default ScrapTypeCombo;
