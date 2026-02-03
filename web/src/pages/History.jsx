import React from 'react';
import ContainerSummary from './ContainerSummary';

const History = () => {
    // Render ContainerSummary in 'summary' (Matrix) view mode, 
    // but with groupByDate=true to show separate columns for each daily entry.
    return <ContainerSummary viewMode="history" />;
};

export default History;
