import type { AppClient } from '@nocobase/app-client';

export interface SalesRole {
  key: string;
  name: string;
}

export interface SalesUser {
  id: string;
  name: string;
  email: string;
  roles: SalesRole[];
}

export interface CustomerProfile {
  id: number;
  customerId: number;
  address: string | null;
  creditLevel: string | null;
  notes: string | null;
}

export interface Customer {
  id: number;
  customerNo: string;
  name: string;
  industry: string | null;
  size: string | null;
  status: string;
  phone: string | null;
  isPublic: boolean;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  profile?: CustomerProfile | null;
}

export interface Contact {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  position: string | null;
  customerId: number;
  ownerId: string;
  customerName?: string;
}

export interface Lead {
  id: number;
  leadNo: string;
  companyName: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  ownerId: string | null;
  status: string;
  notes: string | null;
  convertedAt: string | null;
  convertedCustomerId: number | null;
  createdAt: string;
}

export interface OpportunityContact {
  id: number;
  name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
}

export interface Opportunity {
  id: number;
  opportunityNo: string;
  name: string;
  customerId: number;
  ownerId: string;
  stage: string;
  expectedAmount: number;
  winProbability: number;
  weightedAmount: number;
  expectedCloseDate: string | number | null;
  actualAmount: number | null;
  resultReason: string | null;
  approvalStatus: string;
  isArchived: boolean;
  customerName?: string;
  contacts?: OpportunityContact[];
}

export interface FollowUp {
  id: number;
  subject: string;
  method: string | null;
  followUpAt: string | number;
  nextFollowUpAt: string | number | null;
  content: string | null;
  customerId: number | null;
  opportunityId: number | null;
  contactId: number | null;
  ownerId: string;
  customerName?: string;
  opportunityName?: string;
}

export interface DashboardData {
  stageDistribution: { stage: string; count: number }[];
  expectedAmount: number;
  weightedAmount: number;
  opportunityCount: number;
  perOwner: {
    ownerId: string;
    ownerName: string;
    count: number;
    weightedAmount: number;
  }[];
  wonCount: number;
  lostCount: number;
  winRate: number;
  overdueFollowUpCount: number;
}

export interface ListCustomersParams {
  q?: string;
  status?: string;
  isPublic?: boolean;
}

export interface ListContactsParams {
  q?: string;
  customerId?: number;
}

export interface ListLeadsParams {
  q?: string;
  status?: string;
}

export interface ListOpportunitiesParams {
  q?: string;
  stage?: string;
  customerId?: number;
  includeArchived?: boolean;
}

export interface ListFollowUpsParams {
  q?: string;
  opportunityId?: number;
  customerId?: number;
}

export interface ConvertLeadResult {
  customerId: number;
  opportunityId: number;
  alreadyConverted: boolean;
}

/**
 * Typed wrapper around the application's API client. Every method returns the
 * `data` payload of the `{ data }` envelope the sales API responds with, and
 * throws `AppRequestError` (status + payload) on failure.
 */
export class SalesApi {
  constructor(private readonly client: AppClient) {}

  me(): Promise<SalesUser> {
    return this.get('sales/me');
  }

  listUsers(): Promise<SalesUser[]> {
    return this.get('sales/users');
  }

  dashboard(): Promise<DashboardData> {
    return this.get('sales/dashboard');
  }

  listCustomers(params: ListCustomersParams = {}): Promise<Customer[]> {
    return this.get(`sales/customers${queryString(params)}`);
  }

  /**
   * Public customer directory. The server restricts this endpoint to public
   * customers and to the fields a visitor may read.
   */
  directory(params: { q?: string } = {}): Promise<Customer[]> {
    return this.get(`sales/directory${queryString(params)}`);
  }

  getCustomer(id: number): Promise<Customer> {
    return this.get(`sales/customers/${id}`);
  }

  createCustomer(input: Record<string, unknown>): Promise<Customer> {
    return this.send('sales/customers', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  updateCustomer(
    id: number,
    input: Record<string, unknown>,
  ): Promise<{ updated: boolean }> {
    return this.send(`sales/customers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  changeCustomerOwner(
    id: number,
    ownerId: string,
  ): Promise<{ changed: boolean }> {
    return this.send(`sales/customers/${id}/owner`, {
      method: 'POST',
      body: JSON.stringify({ ownerId }),
    });
  }

  deleteCustomer(id: number): Promise<{ deleted: boolean }> {
    return this.send(`sales/customers/${id}`, { method: 'DELETE' });
  }

  listContacts(params: ListContactsParams = {}): Promise<Contact[]> {
    return this.get(`sales/contacts${queryString(params)}`);
  }

  createContact(input: Record<string, unknown>): Promise<Contact> {
    return this.send('sales/contacts', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  updateContact(
    id: number,
    input: Record<string, unknown>,
  ): Promise<{ updated: boolean }> {
    return this.send(`sales/contacts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  listLeads(params: ListLeadsParams = {}): Promise<Lead[]> {
    return this.get(`sales/leads${queryString(params)}`);
  }

  createLead(input: Record<string, unknown>): Promise<Lead> {
    return this.send('sales/leads', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  updateLead(
    id: number,
    input: Record<string, unknown>,
  ): Promise<{ updated: boolean }> {
    return this.send(`sales/leads/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  assignLead(id: number, ownerId: string): Promise<{ assigned: boolean }> {
    return this.send(`sales/leads/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify({ ownerId }),
    });
  }

  convertLead(id: number): Promise<ConvertLeadResult> {
    return this.send(`sales/leads/${id}/convert`, { method: 'POST' });
  }

  deleteLead(id: number): Promise<{ deleted: boolean }> {
    return this.send(`sales/leads/${id}`, { method: 'DELETE' });
  }

  listOpportunities(
    params: ListOpportunitiesParams = {},
  ): Promise<Opportunity[]> {
    return this.get(`sales/opportunities${queryString(params)}`);
  }

  getOpportunity(id: number): Promise<Opportunity> {
    return this.get(`sales/opportunities/${id}`);
  }

  createOpportunity(input: Record<string, unknown>): Promise<Opportunity> {
    return this.send('sales/opportunities', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  updateOpportunity(
    id: number,
    input: Record<string, unknown>,
  ): Promise<{ updated: boolean }> {
    return this.send(`sales/opportunities/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  advanceOpportunity(id: number): Promise<Opportunity> {
    return this.send(`sales/opportunities/${id}/advance`, { method: 'POST' });
  }

  winOpportunity(
    id: number,
    actualAmount: number,
    resultReason?: string,
  ): Promise<Opportunity> {
    return this.send(`sales/opportunities/${id}/win`, {
      method: 'POST',
      body: JSON.stringify({ actualAmount, resultReason }),
    });
  }

  loseOpportunity(id: number, resultReason: string): Promise<Opportunity> {
    return this.send(`sales/opportunities/${id}/lose`, {
      method: 'POST',
      body: JSON.stringify({ resultReason }),
    });
  }

  archiveOpportunity(id: number): Promise<{ archived: boolean }> {
    return this.send(`sales/opportunities/${id}/archive`, { method: 'POST' });
  }

  listFollowUps(params: ListFollowUpsParams = {}): Promise<FollowUp[]> {
    return this.get(`sales/follow-ups${queryString(params)}`);
  }

  createFollowUp(input: Record<string, unknown>): Promise<FollowUp> {
    return this.send('sales/follow-ups', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  updateFollowUp(
    id: number,
    input: Record<string, unknown>,
  ): Promise<{ updated: boolean }> {
    return this.send(`sales/follow-ups/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  private get<T>(path: string): Promise<T> {
    return this.send(path, { method: 'GET' });
  }

  private async send<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.client.request<{ data: T }>(path, init);
    return response.data;
  }
}

function queryString(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}
