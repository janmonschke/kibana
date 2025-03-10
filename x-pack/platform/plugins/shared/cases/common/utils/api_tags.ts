/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  BULK_GET_USER_PROFILES_API_TAG,
  GET_CONNECTORS_CONFIGURE_API_TAG,
  SUGGEST_USER_PROFILES_API_TAG,
} from '../constants';
import { HttpApiPrivilegeOperation } from '../constants/types';
import type { Owner } from '../constants/types';
import { constructFilesHttpOperationPrivilege } from '../files';

export interface CasesApiTags {
  all: readonly string[];
  read: readonly string[];
  delete: readonly string[];
  createComment: readonly string[];
}

export const getApiTags = (owner: Owner): CasesApiTags => {
  const create = constructFilesHttpOperationPrivilege(owner, HttpApiPrivilegeOperation.Create);
  const deleteTag = constructFilesHttpOperationPrivilege(owner, HttpApiPrivilegeOperation.Delete);
  const read = constructFilesHttpOperationPrivilege(owner, HttpApiPrivilegeOperation.Read);

  return {
    all: [
      SUGGEST_USER_PROFILES_API_TAG,
      BULK_GET_USER_PROFILES_API_TAG,
      GET_CONNECTORS_CONFIGURE_API_TAG,
      read,
    ] as const,
    read: [
      SUGGEST_USER_PROFILES_API_TAG,
      BULK_GET_USER_PROFILES_API_TAG,
      GET_CONNECTORS_CONFIGURE_API_TAG,
      read,
    ] as const,
    delete: [deleteTag] as const,
    createComment: [create] as const,
  };
};
