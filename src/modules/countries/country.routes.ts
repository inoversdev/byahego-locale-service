import { Router } from 'express';
import * as CountryController from './country.controller';

const router = Router();

router.get('/', CountryController.getCountries);
router.get('/:code', CountryController.getCountryByCode);

export default router;