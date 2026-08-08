import type { Translations } from '../localize';
import { annotation } from './annotation';
import { bankAccount } from './bankAccount';
import { bankTransfer } from './bankTransfer';
import { category } from './category';
import { collection } from './collection';
import { costCenter } from './costCenter';
import { creditSchedule } from './creditSchedule';
import { customer } from './customer';
import { debitSchedule } from './debitSchedule';
import { employee } from './employee';
import { file } from './file';
import { partner } from './partner';
import { payment } from './payment';
import { receipt } from './receipt';
import { scheduleFile } from './scheduleFile';
import { serviceInvoice } from './serviceInvoice';
import { shared } from './shared';
import { supplier } from './supplier';

/** Os escopos, num dicionário só. As chaves já vêm prefixadas pelo escopo, então não há como um sobrescrever o outro. */
export const ptBR: Translations = {
	...annotation,
	...bankAccount,
	...bankTransfer,
	...category,
	...collection,
	...costCenter,
	...creditSchedule,
	...customer,
	...debitSchedule,
	...employee,
	...file,
	...partner,
	...payment,
	...receipt,
	...scheduleFile,
	...serviceInvoice,
	...shared,
	...supplier,
};
