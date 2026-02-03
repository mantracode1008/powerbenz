# Firm Combo Control

The `FirmCombo` component provides a searchable dropdown for selecting firms, with the ability to add new firms on the fly.

## Features
- **Search**: Type to filter existing firms.
- **Add New**: If a firm doesn't exist, click "Add as new firm" to create it immediately.
- **Selection**: Selected firm is displayed in the input.

## Usage

```jsx
import FirmCombo from '../components/FirmCombo';

// ... inside component
const [firm, setFirm] = useState('');
const [firmId, setFirmId] = useState(null);

const handleFirmChange = ({ name, id }) => {
    setFirm(name);
    setFirmId(id);
};

// ... inside render
<FirmCombo 
    value={firm}
    onChange={handleFirmChange}
    label="Firm Name"
/>
```

## Backend
- `GET /api/firms?search=term`: Search firms.
- `POST /api/firms`: Create a new firm.
