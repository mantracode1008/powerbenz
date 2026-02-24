import React, { useState, useEffect } from 'react';

const CountUp = ({ end, duration = 2000, decimals = 0, prefix = '', suffix = '' }) => {
    const [count, setCount] = useState(0);

    useEffect(() => {
        let startTime = null;
        let requestId;
        let startValue = 0;
        const targetValue = parseFloat(end) || 0;

        const animate = (timestamp) => {
            if (!startTime) startTime = timestamp;
            const progress = timestamp - startTime;
            const percentage = Math.min(progress / duration, 1);

            // Ease Out Quart function for standard smooth effect
            // 1 - pow(1 - x, 4)
            const easeOutQuart = 1 - Math.pow(1 - percentage, 4);

            const current = startValue + (targetValue - startValue) * easeOutQuart;
            setCount(current);

            if (progress < duration) {
                requestId = requestAnimationFrame(animate);
            } else {
                setCount(targetValue);
            }
        };

        requestId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(requestId);
    }, [end, duration]);

    return (
        <span className="tabular-nums">
            {prefix}
            {count.toLocaleString('en-IN', {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals
            })}
            {suffix}
        </span>
    );
};

export default CountUp;
