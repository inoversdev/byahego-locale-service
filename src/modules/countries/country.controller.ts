
import { Request, Response } from 'express';
import * as CountryService from './country.service';

export const getCountries = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(
      Math.max(Number(req.query.limit) || 20, 1),
      100
    );

    const search =
      typeof req.query.search === 'string'
        ? req.query.search.trim()
        : undefined;

    const offset = (page - 1) * limit;

    const result = await CountryService.getCountries({
      search,
      limit,
      offset
    });

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit)
      }
    });
  } catch (error) {
    console.error('Failed to retrieve countries:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to retrieve countries.'
    });
  }
};

export const getCountryByCode = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const rawCode = req.params.code;
    const code = (Array.isArray(rawCode) ? rawCode[0] : rawCode).trim().toUpperCase();

    const country = await CountryService.getCountryByCode(code);

    if (!country) {
      res.status(404).json({
        success: false,
        message: 'Country not found.'
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: country
    });
  } catch (error) {
    console.error('Failed to retrieve country:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to retrieve country.'
    });
  }
};

export const getCountriesSummary = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const data = await CountryService.getCountriesSummary();

    res.set('Cache-Control', 'public, max-age=300');
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Failed to retrieve countries summary:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to retrieve countries summary.'
    });
  }
};
