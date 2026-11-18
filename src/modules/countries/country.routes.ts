import { Router } from 'express';
import * as CountryController from './country.controller';

const router = Router();

router.get('/', CountryController.getCountries);
// Must stay above '/:code' so "summary" is not read as a country code.
router.get('/summary', CountryController.getCountriesSummary);
router.get('/:code', CountryController.getCountryByCode);

export default router;